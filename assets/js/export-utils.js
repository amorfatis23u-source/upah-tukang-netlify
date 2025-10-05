(function(global){
  'use strict';

  const DEFAULT_DAY_KEYS = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];
  const DEFAULT_DISPLAY_ORDER = [6,0,1,2,3,4,5];
  const DEFAULT_ALLOWANCE_THRESHOLD = 3.9;
  const DEFAULT_ALLOWANCE_AMOUNT = 20000;

  function calcDayWeight(label){
    if (!label) return 0;
    const str = String(label).trim();
    if (!str) return 0;
    if (str === '1/2 Lain') return 0.5;
    if (/^1\/2\b/i.test(str)) return 0.5;
    return 1;
  }

  function normalizeRows(rows){
    if (!Array.isArray(rows)) return [];
    return rows.map((row)=>{
      const rumah = Array.isArray(row && row.rumah) ? row.rumah.slice(0, 7) : [];
      const normalizedRumah = [];
      for (let i=0; i<7; i++){
        normalizedRumah[i] = rumah[i] ? String(rumah[i]) : '';
      }
      const bonusRaw = row && row.bonus !== undefined ? row.bonus : '';
      const bonusStr = bonusRaw == null ? '' : String(bonusRaw);
      return {
        nama: row && row.nama != null ? String(row.nama) : '',
        kelas: row && row.kelas != null ? String(row.kelas) : '',
        group: row && row.group != null ? String(row.group) : '',
        rumah: normalizedRumah,
        ket: row && row.ket != null ? String(row.ket) : '',
        bonus: bonusStr
      };
    });
  }

  function normalizeClassRates(classRates){
    const out = { Senior: 0, Tukang: 0, Kenek: 0 };
    if (classRates && typeof classRates === 'object'){
      for (const k of Object.keys(classRates)){
        const v = Number(classRates[k]);
        if (Number.isFinite(v)) out[k] = v;
      }
    }
    return out;
  }

  function normalizeRumah(list){
    if (!Array.isArray(list)) return [];
    return list.map((item)=> item == null ? '' : String(item)).filter((item)=> item !== '');
  }

  function normalizeDataset(dataset, overrides){
    const src = dataset && typeof dataset === 'object' ? dataset : {};
    const rows = normalizeRows(src.rows || src.data || []);
    const classRates = normalizeClassRates(src.classRates || {});
    const rumah = normalizeRumah(src.rumah || []);
    const allowanceThresholdRaw = overrides && overrides.allowanceThreshold !== undefined
      ? overrides.allowanceThreshold : (src.allowanceThreshold !== undefined ? src.allowanceThreshold : src.threshold);
    const allowanceAmountRaw = overrides && overrides.allowanceAmount !== undefined
      ? overrides.allowanceAmount : (src.allowanceAmount !== undefined ? src.allowanceAmount : src.allowance);
    const allowanceThreshold = Number(allowanceThresholdRaw);
    const allowanceAmount = Number(allowanceAmountRaw);
    const dayKeys = Array.isArray(src.dayKeys) ? src.dayKeys.map((d)=> d == null ? '' : String(d)) : DEFAULT_DAY_KEYS.slice();
    const displayDayOrder = Array.isArray(src.displayDayOrder) && src.displayDayOrder.length === 7
      ? src.displayDayOrder.map((n)=> Number.isInteger(n) ? n : 0)
      : DEFAULT_DISPLAY_ORDER.slice();

    const periodStart = overrides && overrides.periodStart !== undefined ? overrides.periodStart : (src.periode ?? src.periodStart ?? '');
    const periodEnd = overrides && overrides.periodEnd !== undefined ? overrides.periodEnd : (src.sd ?? src.periodEnd ?? '');

    const meta = Object.assign({ source: src.__source || 'manual' }, overrides && overrides.meta ? overrides.meta : {});

    return {
      rows,
      classRates,
      rumah,
      allowanceThreshold: Number.isFinite(allowanceThreshold) ? allowanceThreshold : DEFAULT_ALLOWANCE_THRESHOLD,
      allowanceAmount: Number.isFinite(allowanceAmount) ? allowanceAmount : DEFAULT_ALLOWANCE_AMOUNT,
      dayKeys,
      displayDayOrder,
      periodStart: periodStart == null ? '' : String(periodStart),
      periodEnd: periodEnd == null ? '' : String(periodEnd),
      meta
    };
  }

  function loadFromLegacy(){
    try {
      const rowsRaw = localStorage.getItem('upah20_rows');
      const classRatesRaw = localStorage.getItem('upah20_classRates');
      const rumahRaw = localStorage.getItem('upah20_rumah');
      const thresholdRaw = localStorage.getItem('upah20_beras_threshold');
      const amountRaw = localStorage.getItem('upah20_beras_amount');
      const periodStart = localStorage.getItem('upah20_periodStart');
      const periodEnd = localStorage.getItem('upah20_periodEnd');
      const dataset = {
        rows: rowsRaw ? JSON.parse(rowsRaw) : [],
        classRates: classRatesRaw ? JSON.parse(classRatesRaw) : {},
        rumah: rumahRaw ? JSON.parse(rumahRaw) : [],
        allowanceThreshold: thresholdRaw ? Number(thresholdRaw) : undefined,
        allowanceAmount: amountRaw ? Number(amountRaw) : undefined,
        periode: periodStart || '',
        sd: periodEnd || '',
        __source: 'legacy'
      };
      if (!Array.isArray(dataset.rows)) dataset.rows = [];
      if (!Array.isArray(dataset.rumah)) dataset.rumah = [];
      if (!dataset.rows.length && !dataset.rumah.length && (!dataset.periode && !dataset.sd)){
        return null;
      }
      return normalizeDataset(dataset, { meta: { source: 'legacy' } });
    } catch (_err) {
      return null;
    }
  }

  function loadActiveDataset(){
    let root = null;
    try {
      const raw = localStorage.getItem('upahTukang');
      if (raw) root = JSON.parse(raw);
    } catch (_){ root = null; }
    if (!root || typeof root !== 'object') root = {};
    const items = Array.isArray(root.items) ? root.items : [];
    let active = null;
    if (root.activeId){
      active = items.find((item)=> item && item.id === root.activeId) || null;
    }
    if (!active && items.length){
      active = items[items.length - 1];
    }
    if (active && typeof active === 'object'){
      return normalizeDataset(active, {
        periodStart: active.periode,
        periodEnd: active.sd,
        allowanceThreshold: active.allowanceThreshold,
        allowanceAmount: active.allowanceAmount,
        meta: {
          source: 'storage',
          id: active.id || null,
          createdAt: active.createdAt || null,
          updatedAt: active.updatedAt || null,
          newIndex: active.newIndex || null
        }
      });
    }
    return loadFromLegacy();
  }

  function parseBonus(raw){
    const str = raw == null ? '' : String(raw);
    const cleaned = str.replace(/[^\d]/g, '');
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  }

  function rowComputation(row, ctx){
    const rate = Number(ctx.classRates[row.kelas] || 0);
    const hari = (row.rumah || []).reduce((sum, label)=> sum + calcDayWeight(label), 0);
    const upahPokok = hari * rate;
    const uangBeras = hari > ctx.allowanceThreshold ? ctx.allowanceAmount : 0;
    const bonus = parseBonus(row.bonus);
    const totalBayar = upahPokok + uangBeras + bonus;
    return { rate, hari, upahPokok, uangBeras, bonus, totalBayar };
  }

  function buildSections(dataset){
    const ctx = normalizeDataset(dataset);
    const displayDayKeys = ctx.displayDayOrder.map((idx)=> ctx.dayKeys[idx] || '');

    const detailHeader = ['No','Nama','Kelas','Group','Rate', ...displayDayKeys, 'Hari','Upah Pokok','Uang Beras','Total','Keterangan'];
    const detailRows = ctx.rows.map((row, idx)=>{
      const calc = rowComputation(row, ctx);
      const dayValues = ctx.displayDayOrder.map((di)=> (row.rumah && row.rumah[di]) ? row.rumah[di] : '');
      return [
        idx + 1,
        row.nama || '',
        row.kelas || '',
        row.group || '',
        calc.rate,
        ...dayValues,
        calc.hari,
        calc.upahPokok,
        calc.uangBeras,
        calc.totalBayar,
        row.ket || ''
      ];
    });

    const perRumahMap = new Map();
    ctx.rows.forEach((row)=>{
      const rate = Number(ctx.classRates[row.kelas] || 0);
      for (let di=0; di<7; di++){
        const label = row.rumah ? row.rumah[di] : '';
        if (!label) continue;
        const weight = calcDayWeight(label);
        if (!weight) continue;
        const key = label;
        const current = perRumahMap.get(key) || { hari: 0, upah: 0 };
        current.hari += weight;
        current.upah += rate * weight;
        perRumahMap.set(key, current);
      }
    });

    const rumahSet = new Set(ctx.rumah);
    const extraKeys = [];
    perRumahMap.forEach((_, key)=>{ if (!rumahSet.has(key)) extraKeys.push(key); });
    extraKeys.sort((a,b)=> a.localeCompare(b));
    const orderedRumah = ctx.rumah.slice();
    extraKeys.forEach((key)=>{ if (key) orderedRumah.push(key); });
    if (!orderedRumah.length){
      orderedRumah.push(...Array.from(perRumahMap.keys()).sort((a,b)=> a.localeCompare(b)));
    }

    let totalHariRumah = 0;
    let totalUpahRumah = 0;
    const perRumahRows = orderedRumah.map((name)=>{
      const stat = perRumahMap.get(name) || { hari: 0, upah: 0 };
      totalHariRumah += stat.hari;
      totalUpahRumah += stat.upah;
      return [name, stat.hari, stat.upah];
    }).filter((row)=> row[0]);
    if (!perRumahRows.length && perRumahMap.size){
      perRumahMap.forEach((stat, name)=>{
        totalHariRumah += stat.hari;
        totalUpahRumah += stat.upah;
        perRumahRows.push([name, stat.hari, stat.upah]);
      });
    }
    if (perRumahRows.length){
      perRumahRows.push(['TOTAL', totalHariRumah, totalUpahRumah]);
    }

    const perDayRows = [];
    let totalHariWeek = 0;
    let totalUpahWeek = 0;
    ctx.displayDayOrder.forEach((di, idx)=>{
      const label = displayDayKeys[idx] || `Hari ${idx+1}`;
      let hari = 0;
      let upah = 0;
      ctx.rows.forEach((row)=>{
        const value = row.rumah ? row.rumah[di] : '';
        if (!value) return;
        const weight = calcDayWeight(value);
        if (!weight) return;
        const rate = Number(ctx.classRates[row.kelas] || 0);
        hari += weight;
        upah += rate * weight;
      });
      totalHariWeek += hari;
      totalUpahWeek += upah;
      perDayRows.push([label, hari, upah]);
    });
    if (perDayRows.length){
      perDayRows.push(['TOTAL', totalHariWeek, totalUpahWeek]);
    }

    const sections = [
      { title: 'Detail Pekerja', header: detailHeader, rows: detailRows },
      { title: 'Rekap Total per Rumah', header: ['Rumah','Total Hari','Total Upah'], rows: perRumahRows },
      { title: 'Rekap Total per Hari', header: ['Tanggal','Total Hari','Total Upah'], rows: perDayRows }
    ];

    const meta = {
      generatedAt: new Date().toISOString(),
      rowsCount: ctx.rows.length,
      periodStart: ctx.periodStart,
      periodEnd: ctx.periodEnd
    };

    return { sections, meta, context: ctx };
  }

  function csvEscape(value){
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (/[",\n\r]/.test(str)){
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function sectionsToCSV(sections){
    const lines = [];
    sections.forEach((section, idx)=>{
      if (!section) return;
      if (idx > 0) lines.push('');
      if (section.title) lines.push(csvEscape(section.title));
      if (section.header) lines.push(section.header.map(csvEscape).join(','));
      if (Array.isArray(section.rows)){
        section.rows.forEach((row)=>{
          lines.push(row.map(csvEscape).join(','));
        });
      }
    });
    return lines.join('\r\n');
  }

  function escapeXml(str){
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function columnLetter(idx){
    let n = idx;
    let letters = '';
    while (n > 0){
      const mod = (n - 1) % 26;
      letters = String.fromCharCode(65 + mod) + letters;
      n = Math.floor((n - 1) / 26);
    }
    return letters || 'A';
  }

  function aoaToSheetXml(section){
    const rows = [];
    const aoa = [];
    aoa.push([section.title || '']);
    aoa.push([]);
    aoa.push(section.header || []);
    if (Array.isArray(section.rows)){
      section.rows.forEach((row)=> aoa.push(row));
    }
    let maxCols = 0;
    aoa.forEach((row)=>{ if (row && row.length > maxCols) maxCols = row.length; });
    if (maxCols === 0) maxCols = 1;
    const dimension = `A1:${columnLetter(maxCols)}${aoa.length}`;
    aoa.forEach((row, rowIdx)=>{
      const cells = [];
      if (row && row.length){
        row.forEach((value, colIdx)=>{
          if (value === null || value === undefined || value === '') return;
          const ref = `${columnLetter(colIdx + 1)}${rowIdx + 1}`;
          if (typeof value === 'number'){
            cells.push(`<c r="${ref}" t="n"><v>${value}</v></c>`);
          } else {
            cells.push(`<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`);
          }
        });
      }
      if (cells.length){
        rows.push(`<row r="${rowIdx + 1}">${cells.join('')}</row>`);
      } else {
        rows.push(`<row r="${rowIdx + 1}"/>`);
      }
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<dimension ref="${dimension}"/>` +
      `<sheetData>${rows.join('')}</sheetData>` +
      `</worksheet>`;
  }

  function crc32(buf){
    const table = crc32.table || (crc32.table = (function(){
      const tbl = new Uint32Array(256);
      for (let i=0; i<256; i++){
        let c = i;
        for (let j=0; j<8; j++){
          c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        tbl[i] = c >>> 0;
      }
      return tbl;
    })());
    let crc = 0 ^ (-1);
    for (let i=0; i<buf.length; i++){
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
  }

  function uint16LE(value){
    const arr = new Uint8Array(2);
    arr[0] = value & 0xFF;
    arr[1] = (value >>> 8) & 0xFF;
    return arr;
  }

  function uint32LE(value){
    const arr = new Uint8Array(4);
    arr[0] = value & 0xFF;
    arr[1] = (value >>> 8) & 0xFF;
    arr[2] = (value >>> 16) & 0xFF;
    arr[3] = (value >>> 24) & 0xFF;
    return arr;
  }

  function concatUint8(arrays){
    const total = arrays.reduce((sum, arr)=> sum + arr.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    arrays.forEach((arr)=>{ out.set(arr, offset); offset += arr.length; });
    return out;
  }

  function createZip(files){
    const encoder = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;

    files.forEach((file, index)=>{
      const nameBytes = typeof file.name === 'string' ? encoder.encode(file.name) : file.name;
      const dataBytes = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
      const crc = crc32(dataBytes);
      const localHeader = concatUint8([
        uint32LE(0x04034b50),
        uint16LE(20),
        uint16LE(0),
        uint16LE(0),
        uint16LE(0),
        uint16LE(0),
        uint32LE(crc),
        uint32LE(dataBytes.length),
        uint32LE(dataBytes.length),
        uint16LE(nameBytes.length),
        uint16LE(0)
      ]);
      const localChunk = concatUint8([localHeader, nameBytes, dataBytes]);
      chunks.push(localChunk);

      const centralHeader = concatUint8([
        uint32LE(0x02014b50),
        uint16LE(0x0014),
        uint16LE(20),
        uint16LE(0),
        uint16LE(0),
        uint16LE(0),
        uint32LE(crc),
        uint32LE(dataBytes.length),
        uint32LE(dataBytes.length),
        uint16LE(nameBytes.length),
        uint16LE(0),
        uint16LE(0),
        uint16LE(0),
        uint16LE(0),
        uint32LE(0),
        uint32LE(offset)
      ]);
      central.push(concatUint8([centralHeader, nameBytes]));
      offset += localChunk.length;
    });

    const centralDir = concatUint8(central);
    const endRecord = concatUint8([
      uint32LE(0x06054b50),
      uint16LE(0),
      uint16LE(0),
      uint16LE(files.length),
      uint16LE(files.length),
      uint32LE(centralDir.length),
      uint32LE(offset),
      uint16LE(0)
    ]);

    return concatUint8([...chunks, centralDir, endRecord]);
  }

  function sectionsToXLSX(sections){
    const sheetEntries = sections.map((section)=> aoaToSheetXml(section));
    const files = [];
    files.push({ name: '[Content_Types].xml', data: buildContentTypes(sheetEntries.length) });
    files.push({ name: '_rels/.rels', data: buildRootRels() });
    files.push({ name: 'xl/workbook.xml', data: buildWorkbookXml(sheetEntries.length, sections) });
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: buildWorkbookRels(sheetEntries.length) });
    files.push({ name: 'xl/styles.xml', data: buildStylesXml() });
    sheetEntries.forEach((xml, idx)=>{
      files.push({ name: `xl/worksheets/sheet${idx+1}.xml`, data: xml });
    });
    return createZip(files);
  }

  function buildContentTypes(sheetCount){
    const sheetOverrides = Array.from({length: sheetCount}, (_, idx)=>
      `<Override PartName="/xl/worksheets/sheet${idx+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    ).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>`
      + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
      + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
      + `<Default Extension="xml" ContentType="application/xml"/>`
      + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
      + `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`
      + sheetOverrides
      + `</Types>`;
  }

  function buildRootRels(){
    return `<?xml version="1.0" encoding="UTF-8"?>`
      + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
      + `</Relationships>`;
  }

  function sanitizeSheetName(name){
    const raw = name == null ? '' : String(name);
    const invalid = /[\\\*\?\[\]\/:]/g;
    let cleaned = raw.replace(invalid, ' ').trim();
    if (!cleaned) cleaned = 'Sheet';
    if (cleaned.length > 31) cleaned = cleaned.slice(0, 31);
    return cleaned;
  }

  function buildWorkbookXml(sheetCount, sections){
    const sheetsXml = Array.from({length: sheetCount}, (_, idx)=>{
      const title = sections[idx] && sections[idx].title ? sections[idx].title : `Sheet ${idx+1}`;
      const name = escapeXml(sanitizeSheetName(title));
      return `<sheet name="${name}" sheetId="${idx+1}" r:id="rId${idx+1}"/>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>`
      + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
      + `<sheets>${sheetsXml}</sheets>`
      + `</workbook>`;
  }

  function buildWorkbookRels(sheetCount){
    const rels = Array.from({length: sheetCount}, (_, idx)=>
      `<Relationship Id="rId${idx+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${idx+1}.xml"/>`
    ).join('')
    + `<Relationship Id="rId${sheetCount+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
    return `<?xml version="1.0" encoding="UTF-8"?>`
      + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + rels
      + `</Relationships>`;
  }

  function buildStylesXml(){
    return `<?xml version="1.0" encoding="UTF-8"?>`
      + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
      + `<fonts count="1"><font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font></fonts>`
      + `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>`
      + `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>`
      + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`
      + `<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>`
      + `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>`
      + `</styleSheet>`;
  }

  function timestampName(prefix, ext){
    const d = new Date();
    const pad = (n)=> String(n).padStart(2, '0');
    const name = `${prefix}_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
    return `${name}.${ext}`;
  }

  global.UpahExport = {
    calcDayWeight,
    normalizeDataset,
    buildSections,
    sectionsToCSV,
    sectionsToXLSX,
    loadActiveDataset,
    timestampName
  };
})(typeof window !== 'undefined' ? window : this);
