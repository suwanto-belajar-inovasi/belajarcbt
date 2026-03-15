function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Sistem Keuangan Pembayaran SPP BIZA')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function connectDB() {
  // Pastikan ID Spreadsheet benar
  return SpreadsheetApp.openById('1H4yyRKKHZbsDVMDgXS4Qg2_0AMKmzVLTdcYaj_s9wpE');
}

// --- LOGIN ---
function prosesLogin(form) {
  const ss = connectDB();
  const sheet = ss.getSheetByName('USERS');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    // String comparison untuk keamanan
    if (String(data[i][0]) === String(form.username) && String(data[i][1]) === String(form.password)) {
      return { status: 'sukses', role: data[i][2], akses: data[i][3] };
    }
  }
  return { status: 'gagal' };
}

// --- DATA DASHBOARD ---
function getInitialData() {
  const ss = connectDB();
  const rawSiswa = ss.getSheetByName('SISWA').getRange("A2:C").getValues().filter(r => r[0]);
  
  // Hitung Pemasukan (Transaksi)
  const shTrans = ss.getSheetByName('TRANSAKSI');
  let totalMasuk = 0;
  let mapBayar = {};
  
  if(shTrans.getLastRow() > 1) {
    const dataT = shTrans.getDataRange().getValues();
    for(let i=1; i<dataT.length; i++){
      let nom = Number(dataT[i][4]||0);
      totalMasuk += nom;
      let key = String(dataT[i][2]) + "_" + String(dataT[i][3]); // NIS_KODE
      mapBayar[key] = (mapBayar[key]||0) + nom;
    }
  }

  // Hitung Pengeluaran
  const shKeluar = ss.getSheetByName('PENGELUARAN');
  let totalKeluar = 0;
  if(shKeluar.getLastRow() > 1) {
    const vals = shKeluar.getRange("E2:E").getValues();
    totalKeluar = vals.flat().reduce((a,b) => a + (Number(b)||0), 0);
  }

  // Hitung Total Piutang
  const master = ss.getSheetByName('JENIS_BAYAR').getDataRange().getValues();
  const shKhusus = ss.getSheetByName('TAGIHAN_KHUSUS');
  let khusus = (shKhusus && shKhusus.getLastRow()>1) ? shKhusus.getDataRange().getValues() : [];
  
  let totalPiutang = 0;
  for(let s=0; s<rawSiswa.length; s++){
    let nis = String(rawSiswa[s][0]);
    if(!nis) continue;
    for(let j=1; j<master.length; j++){
      let kode = String(master[j][0]);
      let harga = Number(master[j][2]);
      
      // Cek Override Harga Khusus
      let cekK = khusus.find(k => String(k[1])===nis && String(k[2])===kode);
      if(cekK) harga = Number(cekK[3]);
      
      if(harga===0) continue;
      let sudah = mapBayar[nis+"_"+kode] || 0;
      let sisa = harga - sudah;
      if(sisa>0) totalPiutang += sisa;
    }
  }

  return {
    siswa: rawSiswa,
    stats: {
      masuk: totalMasuk,
      keluar: totalKeluar,
      saldo: totalMasuk - totalKeluar,
      tunggakan: totalPiutang
    }
  };
}

// --- DATA CHART ---
function getChartData(role, akses) {
  const ss = connectDB();
  const dataSiswa = ss.getSheetByName('SISWA').getDataRange().getValues();
  const dataJenis = ss.getSheetByName('JENIS_BAYAR').getDataRange().getValues();
  const dataTrans = ss.getSheetByName('TRANSAKSI').getDataRange().getValues();
  
  let shKhusus = ss.getSheetByName('TAGIHAN_KHUSUS');
  let dataKhusus = (shKhusus && shKhusus.getLastRow()>1) ? shKhusus.getDataRange().getValues() : [];
  
  let mapBayar = {};
  for (let i = 1; i < dataTrans.length; i++) {
    let key = String(dataTrans[i][2]) + "_" + String(dataTrans[i][3]);
    mapBayar[key] = (mapBayar[key] || 0) + Number(dataTrans[i][4]);
  }

  let result = {};
  if (role === 'Bendahara') {
    let kelasStats = {};
    for (let s = 1; s < dataSiswa.length; s++) {
      let nis = String(dataSiswa[s][0]);
      let kelas = String(dataSiswa[s][2]);
      if(!nis || !kelas) continue;
      
      if (!kelasStats[kelas]) kelasStats[kelas] = 0;
      
      for (let j = 1; j < dataJenis.length; j++) {
        let kode = String(dataJenis[j][0]);
        let harga = Number(dataJenis[j][2]);
        let cekK = dataKhusus.find(k => String(k[1]) === nis && String(k[2]) === kode);
        if (cekK) harga = Number(cekK[3]);
        if (harga === 0) continue;
        let sudah = mapBayar[nis + "_" + kode] || 0;
        let sisa = harga - sudah;
        if (sisa > 0) kelasStats[kelas] += sisa;
      }
    }
    result = { labels: Object.keys(kelasStats), values: Object.values(kelasStats) };
  } else {
    result = { totalMasuk: 0, sisa: 0 };
  }
  return result;
}

// --- RIWAYAT ---
function getRiwayatSiswa(nis) {
  try {
    const ss = connectDB();
    const sh = ss.getSheetByName('TRANSAKSI');
    if (!sh || sh.getLastRow() <= 1) return [];
    
    const data = sh.getDataRange().getValues();
    let history = [];
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][2]) === String(nis)) {
        let rawID = String(data[i][0]);
        let baseID = rawID.includes('-') ? rawID.substring(0, rawID.lastIndexOf('-')) : rawID;
        let tglStr = Utilities.formatDate(new Date(data[i][1]), "Asia/Jakarta", "dd/MM/yyyy HH:mm");
        
        let existing = history.find(h => h.id === baseID);
        if (existing) {
          existing.total += Number(data[i][4]);
          existing.items.push({ namaTagihan: data[i][3], nominalBayar: Number(data[i][4]) });
        } else {
          history.push({
            id: baseID,
            tanggal: tglStr,
            petugas: data[i][5],
            total: Number(data[i][4]),
            items: [{ namaTagihan: data[i][3], nominalBayar: Number(data[i][4]) }],
            rawDate: new Date(data[i][1]).getTime()
          });
        }
      }
    }
    return history.sort((a,b) => b.rawDate - a.rawDate);
  } catch(e) { return []; }
}

// --- PROSES BAYAR ---
function prosesPembayaran(data) {
  const ss = connectDB();
  const sh = ss.getSheetByName('TRANSAKSI');
  const timestamp = new Date();
  const idBase = "TRX-" + timestamp.getTime();
  const tglStr = Utilities.formatDate(timestamp, "Asia/Jakarta", "dd/MM/yyyy HH:mm");
  
  // 1. Upload Bukti
  let bukti = "-";
  if (data.metode === 'Transfer' && data.fileData) {
    try {
      const blob = Utilities.newBlob(Utilities.base64Decode(data.fileData), data.mimeType, "Bukti-" + idBase);
      bukti = DriveApp.getRootFolder().createFile(blob).getUrl();
    } catch (e) { bukti = "Error Upload"; }
  }

  // 2. Simpan ke Sheet
  let totalBayar = 0;
  let namaItemStr = [];
  data.items.forEach((item, i) => {
    sh.appendRow([
      idBase + "-" + i,
      timestamp,
      "'" + data.nis,
      item.kode,
      item.nominalBayar,
      data.petugas,
      data.metode,
      bukti
    ]);
    totalBayar += Number(item.nominalBayar);
    namaItemStr.push(`${item.namaTagihan} (Rp${parseInt(item.nominalBayar).toLocaleString('id-ID')})`);
  });

  // 3. Ambil Info No HP
  const shSiswa = ss.getSheetByName('SISWA');
  const dataSiswa = shSiswa.getDataRange().getValues();
  let noHp = "6281234567890";
  for(let i=1; i<dataSiswa.length; i++){
    if(String(dataSiswa[i][0]) === String(data.nis)){
      let rawHp = String(dataSiswa[i][3]);
      if(rawHp) noHp = rawHp.replace(/\D/g,'').replace(/^0/,'62');
      break;
    }
  }

  // 4. Hitung Sisa
  const cek = getTagihanSiswa(data.nis);

  // 5. Pesan WA
  const pesan = `*BUKTI PEMBAYARAN*\n\n` +
    `Siswa: ${data.namaSiswa} (${data.kelas})\n` +
    `ID: ${idBase}\n` +
    `Tanggal: ${tglStr}\n` +
    `--------------------------------\n` +
    `Rincian:\n- ${namaItemStr.join('\n- ')}\n` +
    `--------------------------------\n` +
    `*Total Bayar: Rp${totalBayar.toLocaleString('id-ID')}*\n` +
    `*Sisa Kewajiban: Rp${cek.totalHutang.toLocaleString('id-ID')}*\n\n` +
    `Terima kasih.`;
  
  const linkWA = `https://wa.me/${noHp}?text=${encodeURIComponent(pesan)}`;
  
  // 6. Return Data Nota ke Frontend
  const notaObj = {
    id: idBase,
    tanggal: tglStr,
    siswa: data.namaSiswa,
    nis: data.nis,
    kelas: data.kelas,
    petugas: data.petugas,
    items: data.items,
    totalBayar: totalBayar,
    totalSisa: cek.totalHutang
  };
  
  return { status: 'sukses', wa: linkWA, nota: notaObj };
}

// --- HELPER TAGIHAN ---
function getTagihanSiswa(nis) {
  const ss = connectDB();
  const master = ss.getSheetByName('JENIS_BAYAR').getDataRange().getValues();
  let shK = ss.getSheetByName('TAGIHAN_KHUSUS');
  let khusus = (shK && shK.getLastRow()>1) ? shK.getDataRange().getValues() : [];
  let shT = ss.getSheetByName('TRANSAKSI');
  let trans = (shT && shT.getLastRow()>1) ? shT.getDataRange().getValues() : [];
  
  let mapBayar = {};
  for(let i=1; i<trans.length; i++){
    if(String(trans[i][2]) === String(nis)) {
      let k = String(trans[i][3]);
      mapBayar[k] = (mapBayar[k]||0) + Number(trans[i][4]);
    }
  }
  
  let list = [], totalHutang = 0;
  for(let i=1; i<master.length; i++){
    let kode = String(master[i][0]);
    let nama = master[i][1];
    let harga = Number(master[i][2]);
    let cek = khusus.find(r => String(r[1])===String(nis) && String(r[2])===kode);
    if(cek) harga = Number(cek[3]);
    
    if(harga===0) continue;
    let sisa = harga - (mapBayar[kode]||0);
    if(sisa > 0) {
      list.push({ kode:kode, nama:nama, sisa:sisa });
      totalHutang += sisa;
    }
  }
  return { list: list, totalHutang: totalHutang };
}

function getDataGuru(kelas) {
  const ss = connectDB();
  const siswa = ss.getSheetByName('SISWA').getDataRange().getValues().filter(s => String(s[2]) === String(kelas));
  let rekap = [];
  siswa.forEach(s => {
    let tagihan = getTagihanSiswa(s[0]);
    rekap.push({ nis: s[0], nama: s[1], totalTunggakan: tagihan.totalHutang });
  });
  return rekap;
}

function getDataWali(nis) {
  const ss = connectDB();
  const siswa = ss.getSheetByName('SISWA').getDataRange().getValues().find(s => String(s[0]) === String(nis));
  if(!siswa) return { nama:"-", kelas:"-", list:[], totalHutang:0 };
  const tagihan = getTagihanSiswa(nis);
  return { nama: siswa[1], kelas: siswa[2], list: tagihan.list, totalHutang: tagihan.totalHutang };
}

function simpanPengeluaran(d) {
  connectDB().getSheetByName('PENGELUARAN').appendRow(["OUT-"+new Date().getTime(), new Date(), d.kategori, d.keterangan, d.nominal, d.petugas]);
  return "OK";
}