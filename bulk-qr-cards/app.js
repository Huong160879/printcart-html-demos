(() => {
  "use strict";

  const fields = ["recipient_id", "gallery_url", "recipient_name", "group_name", "card_label", "access_code", "copies", "sort_order"];
  const samples = {
    valid: `recipient_id,gallery_url,recipient_name,group_name,card_label,access_code,copies,sort_order\nSTU-001,https://example.com/gallery/student-001,An Nguyen,Class 5A,Your school photos are ready,,1,1\nSTU-002,https://example.com/gallery/student-002,Binh Tran,Class 5A,Scan to view your photos,,2,2\nSTU-003,https://example.com/gallery/student-003,Chi Le,Class 5B,Memories from picture day,,1,3\nSTU-004,https://example.com/gallery/student-004,Dung Pham,Class 5B,Your portraits are ready,,1,4\nSTU-005,https://example.com/gallery/student-005,Giang Vo,Class 5C,Scan to view and order prints,,1,5`,
    errors: `recipient_id,gallery_url,recipient_name,group_name,card_label,access_code,copies,sort_order\nSTU-101,http://example.com/gallery/student-101,An Nguyen,Class 6A,HTTP is blocked,,1,1\nSTU-102,https://example.com/gallery/student-102,Binh Tran,Class 6A,Valid row,,1,2\nSTU-102,https://example.com/gallery/student-103,Chi Le,Class 6A,Duplicate recipient ID,,1,3\n,https://example.com/gallery/student-104,Dung Pham,Class 6B,Missing recipient ID,,1,4\nSTU-105,not-a-url,Giang Vo,Class 6B,Invalid URL,,0,5\nSTU-106,https://example.com/gallery/student-106,Hanh Bui,Class 6B,This label is intentionally very long so the constrained card template can warn about text that may overflow the safe print area,,many,6`,
    shared: `recipient_id,gallery_url,recipient_name,group_name,card_label,access_code,copies,sort_order\nFAM-201,https://example.com/gallery/family-day-2026,Minh Nguyen,Family Day,Family Day gallery,,3,1\nFAM-202,https://example.com/gallery/family-day-2026,Linh Tran,Family Day,Family Day gallery,,2,2\nFAM-203,https://example.com/gallery/family-day-2026,Quang Le,Family Day,Family Day gallery,,1,3`
  };

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const state = {
    rows: [], filter: "all", step: 1, previewIndex: 0, logoData: "", currentExport: null,
    isGenerating: false, cancelRequested: false, cancelLocked: false,
    config: { template: "minimal", studio: "Northlight Studio", label: "Scan to view your photos", accent: "#3569e8", paper: "a4", grid: "2x4" },
    histories: loadHistory()
  };
  const el = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    ["globalStatus","csvInput","dropZone","browseBtn","urlPaste","pasteImportBtn","emptyState","dataArea","validationSummary","recipientRows","errorsCsvBtn","toCustomizeBtn","importGate","studioName","defaultLabel","accentColor","logoInput","paperSize","gridPreset","cardPreview","studioPreview","logoPreview","cardLabelPreview","recipientPreview","cardKicker","qrCanvas","previewUrl","previewIdentity","longLabelWarning","nextPreviewBtn","toReviewBtn","reviewRecipient","reviewCardHost","paperPreview","pageSelect","sheetPosition","summaryRecipients","summaryCards","summaryPages","summaryPaper","summaryErrors","tokenEstimate","confirmMapping","generateBtn","insufficientBtn","generateDialog","dialogCards","dialogCost","dialogError","generationProgress","progressLabel","progressCount","progressBar","dialogCloseBtn","cancelGenerateBtn","confirmGenerateBtn","resultPanel","resultMeta","downloadPdfBtn","downloadMappingBtn","reprintBtn","historyPanel","historyList","historyEmpty","historyDetail","historyCount","historyBtn","viewHistoryBtn","closeHistoryBtn","newBatchBtn","walletBtn","walletDialog","toast","rowLimitNote"].forEach(id => el[id] = document.getElementById(id));
    bindEvents();
    renderHistory();
    updateStepper();
  }

  function bindEvents() {
    el.browseBtn.addEventListener("click", e => { e.stopPropagation(); el.csvInput.click(); });
    el.dropZone.addEventListener("click", () => el.csvInput.click());
    el.dropZone.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.csvInput.click(); } });
    ["dragenter","dragover"].forEach(name => el.dropZone.addEventListener(name, e => { e.preventDefault(); el.dropZone.classList.add("drag"); }));
    ["dragleave","drop"].forEach(name => el.dropZone.addEventListener(name, e => { e.preventDefault(); el.dropZone.classList.remove("drag"); }));
    el.dropZone.addEventListener("drop", e => { const file = e.dataTransfer.files[0]; if (file) readCsvFile(file); });
    el.csvInput.addEventListener("change", () => { if (el.csvInput.files[0]) readCsvFile(el.csvInput.files[0]); });
    el.pasteImportBtn.addEventListener("click", importPastedUrls);
    $$('[data-sample]').forEach(btn => btn.addEventListener("click", () => loadSample(btn.dataset.sample)));
    $$('[data-filter]').forEach(btn => btn.addEventListener("click", () => { state.filter = btn.dataset.filter; $$('[data-filter]').forEach(b => b.classList.toggle("active", b === btn)); renderRows(); }));
    $("#addRowBtn").addEventListener("click", () => { state.rows.push(blankRow(state.rows.length + 1)); validateRows(); renderImport(); });
    el.recipientRows.addEventListener("input", editCell);
    el.recipientRows.addEventListener("click", e => { const button = e.target.closest("[data-remove]"); if (!button) return; state.rows.splice(Number(button.dataset.remove), 1); state.rows.forEach((r, i) => r._sourceRow = i + 2); validateRows(); renderImport(); });
    el.errorsCsvBtn.addEventListener("click", downloadErrors);
    el.toCustomizeBtn.addEventListener("click", () => showStep(2));
    $$('[data-back]').forEach(btn => btn.addEventListener("click", () => showStep(Number(btn.dataset.back))));
    $$('input[name=template]').forEach(input => input.addEventListener("change", () => { state.config.template = input.value; updateTemplateSelection(); renderCardPreview(); }));
    [el.studioName,el.defaultLabel,el.accentColor,el.paperSize,el.gridPreset].forEach(input => input.addEventListener("input", syncConfig));
    el.logoInput.addEventListener("change", readLogo);
    el.nextPreviewBtn.addEventListener("click", () => { const valid = getValidRows(); state.previewIndex = valid.length ? (state.previewIndex + 1) % valid.length : 0; renderCardPreview(); });
    el.toReviewBtn.addEventListener("click", () => showStep(3));
    $("#cardTab").addEventListener("click", () => switchReviewTab("card"));
    $("#sheetTab").addEventListener("click", () => switchReviewTab("sheet"));
    el.reviewRecipient.addEventListener("change", renderReviewCard);
    el.pageSelect.addEventListener("change", renderSheetPreview);
    el.confirmMapping.addEventListener("change", () => el.generateBtn.disabled = !el.confirmMapping.checked || getErrors().length > 0);
    el.generateBtn.addEventListener("click", openGenerateDialog);
    el.confirmGenerateBtn.addEventListener("click", generateExport);
    [el.cancelGenerateBtn,el.dialogCloseBtn].forEach(button => button.addEventListener("click", cancelGenerationOrClose));
    el.generateDialog.addEventListener("cancel", event => { if(state.isGenerating){event.preventDefault();requestGenerationCancel();} });
    el.insufficientBtn.addEventListener("click", () => toast("Simulation: insufficient balance blocks export; no tokens were deducted."));
    el.downloadPdfBtn.addEventListener("click", () => runPdfDownload(state.currentExport, el.downloadPdfBtn, "Download print PDF"));
    el.downloadMappingBtn.addEventListener("click", () => runMappingDownload(state.currentExport, el.downloadMappingBtn));
    el.reprintBtn.addEventListener("click", () => runPdfDownload(state.currentExport, el.reprintBtn, "Reprint same export"));
    [el.historyBtn,el.viewHistoryBtn].forEach(btn => btn.addEventListener("click", showHistory));
    el.closeHistoryBtn.addEventListener("click", () => { el.historyPanel.hidden = true; showStep(state.step); });
    el.newBatchBtn.addEventListener("click", resetBatch);
    el.walletBtn.addEventListener("click", () => el.walletDialog.showModal());
    $("#dashboardLink").addEventListener("click", e => { e.preventDefault(); toast("Dashboard link placeholder — existing Printcart Dashboard is not rebuilt here."); });
    $$(".stepper button").forEach(btn => btn.addEventListener("click", () => { const target = Number(btn.parentElement.dataset.step); if (target === 1 || (target === 2 && canContinue()) || (target === 3 && canContinue())) showStep(target); }));
  }

  function parseCsv(text) {
    text = text.replace(/^\uFEFF/, "");
    const records = []; let row = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(cell); cell = ""; }
      else if (ch === '\n') { row.push(cell.replace(/\r$/, "")); if (row.some(v => v.trim() !== "")) records.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    if (quoted) throw new Error("CSV contains an unclosed quoted field");
    row.push(cell.replace(/\r$/, "")); if (row.some(v => v.trim() !== "")) records.push(row);
    if (!records.length) return [];
    const headers = records.shift().map(h => h.trim().toLowerCase());
    const missing = ["recipient_id", "gallery_url"].filter(h => !headers.includes(h));
    if (missing.length) throw new Error(`Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`);
    const duplicateHeaders = headers.filter((header,index) => header && headers.indexOf(header) !== index);
    if (duplicateHeaders.length) throw new Error(`Duplicate column name: ${[...new Set(duplicateHeaders)].join(", ")}`);
    if (records.length > 1000) throw new Error(`CSV has ${records.length.toLocaleString()} data rows; this prototype accepts at most 1,000. No rows were imported.`);
    return records.map((values, index) => {
      const item = blankRow(index + 2);
      headers.forEach((header, i) => { if (fields.includes(header)) item[header] = (values[i] || "").trim(); });
      return item;
    });
  }

  function blankRow(sourceRow) { return { recipient_id:"",gallery_url:"",recipient_name:"",group_name:"",card_label:"",access_code:"",copies:"1",sort_order:String(Math.max(1, sourceRow - 1)),_sourceRow:sourceRow,_errors:{} }; }

  function readCsvFile(file) {
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") return setStatus("Choose a .csv file.", true);
    const reader = new FileReader();
    setStatus(`Reading ${file.name}…`);
    reader.onload = () => { try { importRows(parseCsv(reader.result)); setStatus(`${file.name} imported and validated.`); } catch (error) { setStatus(error.message, true); } };
    reader.onerror = () => setStatus("The CSV could not be read.", true);
    reader.readAsText(file, "UTF-8");
  }

  function importPastedUrls() {
    const urls = el.urlPaste.value.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
    if (!urls.length) return setStatus("Paste at least one gallery URL.", true);
    importRows(urls.slice(0,1000).map((url, i) => ({ ...blankRow(i + 2), recipient_id:`URL-${String(i + 1).padStart(3,"0")}`, gallery_url:url })));
    setStatus(`${urls.length} URL${urls.length === 1 ? "" : "s"} imported.`);
  }

  function loadSample(name) {
    if (name === "stress") {
      const rows = Array.from({length:1000}, (_, i) => ({...blankRow(i+2),recipient_id:`BENCH-${String(i+1).padStart(4,"0")}`,gallery_url:`https://example.com/gallery/benchmark-${i+1}`,recipient_name:`Recipient ${i+1}`,group_name:`Group ${Math.floor(i/25)+1}`,card_label:"Scan to view your photos",copies:String(i%20===0?2:1),sort_order:String(i+1)}));
      const started = performance.now(); importRows(rows); setStatus(`1,000 rows validated in ${Math.round(performance.now()-started)} ms on this browser. This is not a production SLA.`); return;
    }
    importRows(parseCsv(samples[name])); setStatus(`Loaded ${name === "errors" ? "mixed-error" : name} sample data.`);
  }

  function importRows(rows) { state.rows = rows; state.previewIndex = 0; validateRows(); renderImport(); }

  function validateRows() {
    const counts = new Map();
    state.rows.forEach(row => { const id = row.recipient_id.trim(); if (id) counts.set(id, (counts.get(id) || 0) + 1); });
    state.rows.forEach(row => {
      const errors = {};
      if (!row.recipient_id.trim()) errors.recipient_id = "Recipient ID is required";
      else if (counts.get(row.recipient_id.trim()) > 1) errors.recipient_id = "Duplicate recipient ID";
      if (!row.gallery_url.trim()) errors.gallery_url = "Gallery URL is required";
      else { try { const u = new URL(row.gallery_url); if (u.protocol !== "https:") errors.gallery_url = "Use an HTTPS URL"; } catch { errors.gallery_url = "Enter a valid HTTPS URL"; } }
      const copies = Number(row.copies || 1); if (!Number.isInteger(copies) || copies < 1 || copies > 50) errors.copies = "Use a whole number from 1 to 50";
      const order = Number(row.sort_order || row._sourceRow); if (!Number.isFinite(order)) errors.sort_order = "Sort order must be a number";
      if ((row.card_label || "").length > 90) errors.card_label = "Maximum 90 characters";
      if ((row.recipient_name || "").length > 80) errors.recipient_name = "Maximum 80 characters";
      row._errors = errors;
    });
  }

  function getValidRows() { return state.rows.filter(r => Object.keys(r._errors).length === 0).sort((a,b) => Number(a.sort_order||a._sourceRow)-Number(b.sort_order||b._sourceRow) || a._sourceRow-b._sourceRow); }
  function getErrors() { return state.rows.filter(r => Object.keys(r._errors).length); }
  function totalCards(rows = getValidRows()) { return rows.reduce((sum,row) => sum + Number(row.copies || 1), 0); }
  function canContinue() { return state.rows.length > 0 && getErrors().length === 0 && getValidRows().length > 0; }

  function renderImport() {
    el.emptyState.hidden = state.rows.length > 0; el.dataArea.hidden = state.rows.length === 0;
    const valid = getValidRows(), errors = getErrors(), copies = totalCards(valid);
    el.validationSummary.innerHTML = tile("Imported rows",state.rows.length)+tile("Valid rows",valid.length,"good")+tile("Blocking errors",errors.length,errors.length?"bad":"good")+tile("Physical cards",copies);
    $("#allCount").textContent = state.rows.length; $("#validCount").textContent = valid.length; $("#errorCount").textContent = errors.length;
    el.errorsCsvBtn.disabled = !errors.length; el.toCustomizeBtn.disabled = !canContinue();
    el.importGate.textContent = errors.length ? `${errors.length} blocking row${errors.length===1?"":"s"}. Fix every error before continuing.` : valid.length ? `${valid.length} valid recipients · ${copies} physical cards ready.` : "Import valid recipient data to continue.";
    el.rowLimitNote.textContent = state.rows.length > 20 ? `Showing the first 20 of ${state.rows.length} rows. Validation and export include all rows.` : `Showing all ${state.rows.length} rows.`;
    renderRows();
  }

  function tile(label,value,kind="") { return `<div class="summary-tile ${kind}"><span>${escapeHtml(label)}</span><strong>${Number(value).toLocaleString()}</strong></div>`; }

  function renderRows() {
    const filtered = state.rows.map((row,index)=>({row,index})).filter(({row}) => state.filter === "all" || (state.filter === "valid" ? !Object.keys(row._errors).length : Object.keys(row._errors).length)).slice(0,20);
    el.recipientRows.innerHTML = filtered.map(({row,index}) => {
      const err = row._errors; const input = (field,value,type="text") => `<input type="${type}" data-index="${index}" data-field="${field}" class="${err[field]?"invalid":""}" value="${escapeAttr(value)}" aria-label="${field.replaceAll("_"," ")} row ${row._sourceRow}" ${err[field]?`aria-describedby="err-${index}-${field}"`:""}>${err[field]?`<span class="cell-error" id="err-${index}-${field}">${escapeHtml(err[field])}</span>`:""}`;
      return `<tr><td class="row-number">${row._sourceRow}</td><td>${input("recipient_id",row.recipient_id)}</td><td>${input("gallery_url",row.gallery_url,"url")}</td><td><div class="row-name">${input("recipient_name",row.recipient_name)}${input("group_name",row.group_name)}</div></td><td>${input("card_label",row.card_label)}</td><td>${input("copies",row.copies,"number")}</td><td>${input("sort_order",row.sort_order,"number")}</td><td><span class="status-badge ${Object.keys(err).length?"error":"valid"}">${Object.keys(err).length?`! ${Object.keys(err).length} error${Object.keys(err).length===1?"":"s"}`:"✓ Valid"}</span></td><td><button class="icon-btn" type="button" data-remove="${index}" aria-label="Remove row ${row._sourceRow}">×</button></td></tr>`;
    }).join("") || `<tr><td colspan="9">No rows match this filter.</td></tr>`;
  }

  function editCell(e) {
    const input = e.target.closest("[data-field]"); if (!input) return;
    state.rows[Number(input.dataset.index)][input.dataset.field] = input.value; validateRows(); renderImport();
  }

  function downloadErrors() {
    const lines = [["row","field","error","recipient_id","gallery_url"]];
    getErrors().forEach(row => Object.entries(row._errors).forEach(([field,message]) => lines.push([row._sourceRow,field,message,row.recipient_id,row.gallery_url])));
    downloadText("bulk-qr-errors.csv", toCsv(lines), "text/csv;charset=utf-8");
  }

  function syncConfig() {
    state.config.studio = el.studioName.value.trim() || "Your Studio"; state.config.label = el.defaultLabel.value.trim() || "Scan to view your photos"; state.config.accent = el.accentColor.value; state.config.paper = el.paperSize.value; state.config.grid = el.gridPreset.value; renderCardPreview();
  }

  function readLogo() {
    const file = el.logoInput.files[0]; if (!file) { state.logoData=""; return renderCardPreview(); }
    if (file.size > 2*1024*1024) return toast("Logo must be smaller than 2 MB for this prototype.");
    const reader = new FileReader(); reader.onload = () => { state.logoData = reader.result; renderCardPreview(); }; reader.readAsDataURL(file);
  }

  function updateTemplateSelection() { $$(".template-option").forEach(label => label.classList.toggle("selected", $("input",label).checked)); }

  async function renderCardPreview(rowOverride) {
    const valid = getValidRows(); const row = rowOverride || valid[state.previewIndex] || valid[0]; if (!row) return;
    el.cardPreview.className = `qr-card template-${state.config.template}`; el.cardPreview.style.setProperty("--accent",state.config.accent);
    el.studioPreview.textContent = state.config.studio; el.cardLabelPreview.textContent = row.card_label || state.config.label; el.recipientPreview.textContent = [row.recipient_name,row.group_name].filter(Boolean).join(" · ") || row.recipient_id; el.cardKicker.textContent = state.config.template === "school" ? "YOUR SCHOOL PHOTOS" : "PHOTO GALLERY"; el.previewUrl.textContent = row.gallery_url; el.previewIdentity.textContent = row.recipient_id;
    el.logoPreview.hidden = !state.logoData; $(".studio-mark",el.cardPreview).hidden = Boolean(state.logoData); if(state.logoData) el.logoPreview.src = state.logoData;
    el.longLabelWarning.hidden = (row.card_label || state.config.label).length <= 54;
    await drawQr(el.qrCanvas,row.gallery_url,220);
  }

  function showStep(step) {
    state.step = step; el.resultPanel.hidden = true; el.historyPanel.hidden = true; $$('[data-panel]').forEach(panel => panel.hidden = Number(panel.dataset.panel) !== step); updateStepper();
    if (step === 2) renderCardPreview(); if (step === 3) renderReview(); window.scrollTo({top:110,behavior:"smooth"});
  }

  function updateStepper() { $$(".stepper li").forEach(li => { const n=Number(li.dataset.step); li.classList.toggle("active",n===state.step); li.classList.toggle("complete",n<state.step); if(n===state.step) li.querySelector("button").setAttribute("aria-current","step"); else li.querySelector("button").removeAttribute("aria-current"); }); }

  function renderReview() {
    const rows=getValidRows(), cards=expandCards(rows), {cols,rows:rowCount,perPage}=gridInfo(); const pages=Math.ceil(cards.length/perPage);
    el.summaryRecipients.textContent=rows.length.toLocaleString(); el.summaryCards.textContent=cards.length.toLocaleString(); el.summaryPages.textContent=pages.toLocaleString(); el.summaryPaper.textContent=`${state.config.paper.toUpperCase()} · ${cols} × ${rowCount}`; el.summaryErrors.textContent=getErrors().length; const cost=Math.max(25,Math.ceil(cards.length/100)*5); el.tokenEstimate.textContent=`${cost} demo tokens`; el.dialogCards.textContent=cards.length.toLocaleString(); el.dialogCost.textContent=`${cost} demo tokens`;
    el.pageSelect.innerHTML=Array.from({length:pages},(_,i)=>`<option value="${i}">Page ${i+1}${i===0?" · first":i===pages-1?" · last":i===Math.floor((pages-1)/2)?" · middle":""}</option>`).join("");
    renderReviewCard(); renderSheetPreview(); el.confirmMapping.checked=false; el.generateBtn.disabled=true;
  }

  function reviewRow() { const rows=getValidRows(); if(!rows.length)return null; if(el.reviewRecipient.value==="last")return rows.at(-1); if(el.reviewRecipient.value==="longest")return [...rows].sort((a,b)=>(b.card_label||state.config.label).length-(a.card_label||state.config.label).length)[0]; return rows[0]; }

  async function renderReviewCard() {
    const row=reviewRow(); if(!row)return; const clone=el.cardPreview.cloneNode(true); clone.id="reviewCard"; const canvas=$("canvas",clone); canvas.id="reviewQrCanvas"; el.reviewCardHost.replaceChildren(clone); $(".studio-lockup strong",clone).textContent=state.config.studio; $(".card-copy h3",clone).textContent=row.card_label||state.config.label; $(".card-copy p:last-child",clone).textContent=[row.recipient_name,row.group_name].filter(Boolean).join(" · ")||row.recipient_id; const img=$(".studio-lockup img",clone), mark=$(".studio-mark",clone); img.hidden=!state.logoData; mark.hidden=Boolean(state.logoData); if(state.logoData)img.src=state.logoData; await drawQr(canvas,row.gallery_url,220); $("#reviewPosition").textContent=`${row.recipient_id} · ${row.gallery_url}`;
  }

  async function renderSheetPreview() {
    const cards=expandCards(getValidRows()), info=gridInfo(), page=Number(el.pageSelect.value||0), start=page*info.perPage, pageCards=cards.slice(start,start+info.perPage); el.paperPreview.className=`paper ${state.config.paper}`; el.paperPreview.style.gridTemplateColumns=`repeat(${info.cols},1fr)`; el.paperPreview.style.gridTemplateRows=`repeat(${info.rows},1fr)`;
    el.paperPreview.innerHTML=pageCards.map((c,i)=>`<div class="paper-card"><strong>${escapeHtml(c.card_label||state.config.label)}</strong><canvas data-url="${escapeAttr(c.gallery_url)}" width="90" height="90"></canvas><small>${escapeHtml(c.recipient_name||c.recipient_id)}</small><em>R${Math.floor(i/info.cols)+1} · C${i%info.cols+1}</em></div>`).join("");
    await Promise.all($$("canvas[data-url]",el.paperPreview).map(c=>drawQr(c,c.dataset.url,90))); el.sheetPosition.textContent=`Page ${page+1} · cards ${start+1}–${Math.min(start+info.perPage,cards.length)} of ${cards.length}`;
  }

  function switchReviewTab(tab) { const card=tab==="card"; $("#cardTab").setAttribute("aria-selected",card); $("#sheetTab").setAttribute("aria-selected",!card); $("#cardReviewPanel").hidden=!card; $("#sheetReviewPanel").hidden=card; if(!card)renderSheetPreview(); }

  function gridInfo(config=state.config) { const [cols,rows]=config.grid.split("x").map(Number); return {cols,rows,perPage:cols*rows}; }
  function expandCards(rows) { return rows.flatMap(row=>Array.from({length:Number(row.copies||1)},(_,i)=>({...row,copy_number:i+1}))); }

  function openGenerateDialog() {
    if(!canContinue())return toast("Fix blocking errors before generation.");
    state.cancelRequested=false; state.cancelLocked=false; el.dialogError.hidden=true; el.dialogError.textContent=""; el.generationProgress.hidden=true; el.cancelGenerateBtn.disabled=false; el.cancelGenerateBtn.textContent="Cancel"; el.dialogCloseBtn.disabled=false; el.generateDialog.showModal();
  }

  function cancelGenerationOrClose() { if(!state.isGenerating)return el.generateDialog.close(); requestGenerationCancel(); }
  function requestGenerationCancel() {
    if(!state.isGenerating||state.cancelLocked)return;
    state.cancelRequested=true; el.cancelGenerateBtn.disabled=true; el.dialogCloseBtn.disabled=true; el.cancelGenerateBtn.textContent="Cancelling…"; el.progressLabel.textContent="Cancelling safely…"; setStatus("Cancelling export before any completed batch is recorded…");
  }
  function ensureNotCancelled(){if(state.cancelRequested){const error=new Error("Export cancelled");error.name="ExportCancelledError";throw error;}}
  function updateGenerationProgress(done,total,pages,phase="Rendering QR cards") { el.generationProgress.hidden=false; el.progressBar.max=Math.max(1,total); el.progressBar.value=done; el.progressCount.textContent=`${done.toLocaleString()} / ${total.toLocaleString()} · ${pages} page${pages===1?"":"s"}`; el.progressLabel.textContent=phase; }
  function yieldToBrowser(){return new Promise(resolve=>setTimeout(resolve,0));}

  function snapshotPayload(record){return JSON.stringify({layout_version:record.layout_version,config:record.config,logoData:record.logoData||"",cards:record.cards.map(c=>({batch_id:c.batch_id,export_id:c.export_id,card_id:c.card_id,recipient_id:c.recipient_id,gallery_url:c.gallery_url,qr_value:c.qr_value,copies:c.copies,copy_number:c.copy_number,page:c.page,row:c.row,column:c.column,template_version:c.template_version}))});}
  function snapshotSignature(record){return `SNAP-${hash(snapshotPayload(record))}`;}
  function validateExportSnapshot(record){if(!record)throw new Error("No completed export is available");const actual=snapshotSignature(record);if(record.snapshot_signature!==actual)throw new Error("Export snapshot integrity check failed");return actual;}
  function createExportRecord() {
    const rows=getValidRows().map(row=>Object.fromEntries(fields.map(field=>[field,row[field]]))), now=new Date(), batchId=`BQR-${now.toISOString().slice(0,10).replaceAll("-","")}-${hash(rows.map(r=>r.recipient_id+r.gallery_url).join("|"))}`, exportId=`EXP-${hash(batchId+JSON.stringify(state.config))}`, info=gridInfo(), cardIdByRecipient=new Map();
    rows.forEach(row=>cardIdByRecipient.set(row.recipient_id,`CARD-${hash(batchId+"|"+row.recipient_id)}`));
    const cards=expandCards(rows).map((row,index)=>({...row,batch_id:batchId,export_id:exportId,card_id:cardIdByRecipient.get(row.recipient_id),qr_value:row.gallery_url,page:Math.floor(index/info.perPage)+1,row:Math.floor((index%info.perPage)/info.cols)+1,column:(index%info.cols)+1,template_version:`${state.config.template}-v1`,status:"Active"}));
    const record={batch_id:batchId,export_id:exportId,status:"Completed",created_at:now.toISOString(),version:1,layout_version:"bulk-qr-layout-v1",config:{...state.config},logoData:state.logoData,recipients:rows,cards,demo_overrides:{},audit:[{timestamp:now.toISOString(),action:"export_completed",actor:"demo-user",target:exportId}]};
    record.snapshot_signature=snapshotSignature(record); return record;
  }

  async function generateExport() {
    if(state.isGenerating)return;
    state.isGenerating=true; state.cancelRequested=false; state.cancelLocked=false; el.confirmGenerateBtn.disabled=true; el.confirmGenerateBtn.textContent="Generating…"; el.cancelGenerateBtn.disabled=false; el.dialogCloseBtn.disabled=false; el.dialogError.hidden=true; el.dialogError.textContent=""; setStatus("Generating stable IDs, QR assets and export mapping…");
    try {
      const record=createExportRecord(), info=gridInfo(record.config), pages=Math.ceil(record.cards.length/info.perPage); updateGenerationProgress(0,record.cards.length,pages);
      const pdf=await generatePdf(record,false,{shouldCancel:()=>state.cancelRequested,onProgress:(done,total)=>updateGenerationProgress(done,total,pages,`Rendering page ${Math.max(1,Math.ceil(done/info.perPage))} of ${pages}`)}); ensureNotCancelled();
      const mapping=createMappingCsv(record); if(!mapping.text||mapping.count!==record.cards.length)throw new Error("Mapping CSV is incomplete");
      state.cancelLocked=true; el.cancelGenerateBtn.disabled=true; el.dialogCloseBtn.disabled=true; updateGenerationProgress(record.cards.length,record.cards.length,pages,"Finalizing both downloads…");
      const saveResult=pdf.save(`${record.batch_id}-${record.export_id}.pdf`,{returnPromise:true}); if(saveResult&&typeof saveResult.then==="function")await saveResult; downloadText(`${record.batch_id}-mapping.csv`,mapping.text,"text/csv;charset=utf-8");
      state.currentExport=record; state.histories=state.histories.filter(h=>h.export_id!==record.export_id); state.histories.unshift(record); saveHistory(); renderHistory(); el.generateDialog.close(); $$('[data-panel]').forEach(panel=>panel.hidden=true); el.resultPanel.hidden=false; el.resultMeta.textContent=`${record.cards.length.toLocaleString()} cards · ${pages} pages · ${record.batch_id} · No tokens deducted`; setStatus(`Export completed. PDF and mapping verified against ${record.snapshot_signature}.`); window.scrollTo({top:110,behavior:"smooth"});
    } catch(error) {
      console.error(error); const cancelled=error.name==="ExportCancelledError", message=cancelled?"Export cancelled. No files, history or token charge were recorded.":`Export failed: ${error.message}. Your imported recipients are still available; resolve the issue and retry.`; el.dialogError.textContent=message; el.dialogError.hidden=false; setStatus(message,!cancelled); toast(cancelled?"Export cancelled safely.":"Export failed. No completed history or charge was recorded.");
    } finally { state.isGenerating=false; state.cancelLocked=false; el.confirmGenerateBtn.disabled=false; el.confirmGenerateBtn.textContent="Confirm & generate"; el.cancelGenerateBtn.disabled=false; el.cancelGenerateBtn.textContent="Cancel"; el.dialogCloseBtn.disabled=false; }
  }

  async function generatePdf(record, download, options={}) {
    validateExportSnapshot(record); if(!window.jspdf)throw new Error("PDF library is unavailable"); if(typeof window.qrcode!=="function")throw new Error("QR library is unavailable");
    const {jsPDF}=window.jspdf, config=record.config, info=gridInfo(config), isA4=config.paper==="a4", pageW=isA4?210:215.9, pageH=isA4?297:279.4, margin=10, gap=3, cardW=(pageW-margin*2-gap*(info.cols-1))/info.cols, cardH=(pageH-margin*2-gap*(info.rows-1))/info.rows, pdf=new jsPDF({orientation:"portrait",unit:"mm",format:isA4?"a4":"letter",compress:true});
    for(let index=0;index<record.cards.length;index++){
      if(options.shouldCancel?.())ensureNotCancelled(); if(index>0&&index%info.perPage===0)pdf.addPage(); const pos=index%info.perPage,row=Math.floor(pos/info.cols),col=pos%info.cols,x=margin+col*(cardW+gap),y=margin+row*(cardH+gap),card=record.cards[index];
      pdf.setDrawColor(190,198,210); pdf.setLineDashPattern([1,1],0); pdf.rect(x,y,cardW,cardH); pdf.setLineDashPattern([],0); const accent=hexToRgb(config.accent);
      if(config.template==="branded"){pdf.setFillColor(23,40,68);pdf.rect(x+.6,y+.6,cardW-1.2,cardH-1.2,"F");pdf.setFillColor(...accent);pdf.rect(x+.6,y+.6,2,cardH-1.2,"F");pdf.setTextColor(255,255,255);} else {pdf.setFillColor(config.template==="school"?255:255,config.template==="school"?248:255,config.template==="school"?231:255);pdf.rect(x+.6,y+.6,cardW-1.2,cardH-1.2,"F");pdf.setTextColor(23,32,51);pdf.setFillColor(...accent); if(config.template==="school")pdf.rect(x+.6,y+.6,cardW-1.2,2,"F");else pdf.rect(x+.6,y+cardH-2.6,cardW-1.2,2,"F");}
      if(record.logoData){try{pdf.addImage(record.logoData,"PNG",x+5,y+5,8,8,undefined,"FAST");}catch{}} else {pdf.setFillColor(...accent);pdf.roundedRect(x+5,y+5,8,8,1.5,1.5,"F");pdf.setTextColor(255,255,255);pdf.setFontSize(5);pdf.text(config.studio.slice(0,1).toUpperCase(),x+9,y+10.5,{align:"center"});}
      pdf.setFont("helvetica","bold");pdf.setFontSize(6);pdf.setTextColor(config.template==="branded"?255:23,config.template==="branded"?255:32,config.template==="branded"?255:51);pdf.text(safePdfText(config.studio).slice(0,36),x+15,y+10);
      pdf.setFontSize(5);pdf.setTextColor(...accent);pdf.text(config.template==="school"?"YOUR SCHOOL PHOTOS":"PHOTO GALLERY",x+5,y+cardH*.36);
      pdf.setFontSize(Math.max(7,Math.min(10,cardW/8)));pdf.setTextColor(config.template==="branded"?255:23,config.template==="branded"?255:32,config.template==="branded"?255:51); const label=pdf.splitTextToSize(safePdfText(card.card_label||config.label),cardW*.47).slice(0,3);pdf.text(label,x+5,y+cardH*.45);
      pdf.setFont("helvetica","normal");pdf.setFontSize(5);pdf.setTextColor(config.template==="branded"?210:100,config.template==="branded"?218:112,config.template==="branded"?230:128);pdf.text(safePdfText(card.recipient_name||card.recipient_id).slice(0,45),x+5,y+cardH*.75);
      const qrSize=Math.min(cardH*.52,cardW*.34,30),qrX=x+cardW-qrSize-5,qrY=y+Math.max(5,(cardH-qrSize)/2-2),qrData=await qrDataUrl(card.qr_value,420);pdf.setFillColor(255,255,255);pdf.rect(qrX-1.5,qrY-1.5,qrSize+3,qrSize+3,"F");pdf.addImage(qrData,"PNG",qrX,qrY,qrSize,qrSize,undefined,"FAST");pdf.setTextColor(config.template==="branded"?220:70);pdf.setFontSize(4);pdf.text("SCAN TO OPEN GALLERY",qrX+qrSize/2,qrY+qrSize+3,{align:"center"});
      pdf.setTextColor(125);pdf.setFontSize(3.5);pdf.text(`${record.batch_id} · P${card.page} R${card.row} C${card.column}`,x+cardW-3,y+cardH-2.5,{align:"right"}); options.onProgress?.(index+1,record.cards.length); await yieldToBrowser();
    }
    if(options.shouldCancel?.())ensureNotCancelled(); validateExportSnapshot(record); const bytes=pdf.output("arraybuffer"); if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<1000)throw new Error("Generated PDF is empty or invalid");
    if(download){const saveResult=pdf.save(`${record.batch_id}-${record.export_id}.pdf`,{returnPromise:true});if(saveResult&&typeof saveResult.then==="function")await saveResult;} return pdf;
  }

  async function runPdfDownload(record,button,idleLabel) {
    if(!record){setStatus("Download failed: no completed export is available.",true);return toast("No completed export is available.");}
    button.disabled=true; button.textContent="Preparing PDF…"; setStatus(`Preparing ${record.cards.length.toLocaleString()} QR cards for download…`);
    try{await generatePdf(record,true);setStatus(`PDF downloaded: ${record.batch_id} · ${record.cards.length.toLocaleString()} cards.`);toast("PDF download started.");}
    catch(error){console.error(error);setStatus(`PDF download failed: ${error.message}`,true);toast(`PDF download failed: ${error.message}`);}
    finally{button.disabled=false;button.textContent=idleLabel;}
  }

  function runMappingDownload(record,button) {
    button.disabled=true;
    try{const count=downloadMapping(record);setStatus(`Mapping CSV downloaded: ${count.toLocaleString()} card rows.`);toast("Mapping CSV download started.");}
    catch(error){console.error(error);setStatus(`Mapping CSV download failed: ${error.message}`,true);toast(`Mapping CSV download failed: ${error.message}`);}
    finally{button.disabled=false;}
  }

  function downloadMapping(record) {
    const mapping=createMappingCsv(record); downloadText(`${record.batch_id}-mapping.csv`,mapping.text,"text/csv;charset=utf-8"); return mapping.count;
  }
  function createMappingCsv(record) { validateExportSnapshot(record); const header=["batch_id","export_id","snapshot_signature","layout_version","card_id","recipient_id","destination","page","row","column","copies","copy_number","template_version","qr_value","status"]; const lines=[header,...record.cards.map(c=>[c.batch_id,c.export_id,record.snapshot_signature,record.layout_version,c.card_id,c.recipient_id,c.gallery_url,c.page,c.row,c.column,c.copies,c.copy_number,c.template_version,c.qr_value,c.status||"Active"])]; return {text:toCsv(lines),count:record.cards.length}; }

  function toCsv(rows) { return "\uFEFF"+rows.map(row=>row.map(csvCell).join(",")).join("\r\n"); }
  function csvCell(value) { let text=String(value??""); if(/^[=+\-@\t\r]/.test(text))text="'"+text; return `"${text.replaceAll('"','""')}"`; }
  function downloadText(name,text,type) { const blob=new Blob([text],{type});if(!blob.size)throw new Error("Generated file is empty");const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.style.display="none";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000); }

  function normalizeHistoryRecord(record){if(!record||!Array.isArray(record.cards))return null;record.layout_version=record.layout_version||"bulk-qr-layout-v1";record.demo_overrides=record.demo_overrides||{};record.audit=Array.isArray(record.audit)?record.audit:[];record.snapshot_signature=record.snapshot_signature||snapshotSignature(record);return record;}
  function loadHistory(){try{return JSON.parse(localStorage.getItem("printcart_bulk_qr_history")||"[]").map(normalizeHistoryRecord).filter(Boolean);}catch{return[]}}
  function saveHistory(){try{localStorage.setItem("printcart_bulk_qr_history",JSON.stringify(state.histories.slice(0,8)));}catch{toast("Browser storage is full; history was not persisted.");}}
  function renderHistory(){el.historyCount.textContent=state.histories.length;el.historyEmpty.hidden=state.histories.length>0;el.historyList.innerHTML=state.histories.map((r,i)=>`<article class="history-item"><div><strong>${escapeHtml(r.batch_id)}</strong><small>${new Date(r.created_at).toLocaleString()}</small><span class="status-badge valid">✓ ${escapeHtml(r.status)}</span></div><div><small>Recipients</small><strong>${r.recipients.length}</strong></div><div><small>Cards</small><strong>${r.cards.length}</strong></div><div><small>Export</small><strong>v${r.version}</strong></div><div class="history-actions"><button class="btn compact secondary" data-history-open="${i}">Inspect</button><button class="btn compact secondary" data-history-pdf="${i}">PDF</button><button class="btn compact secondary" data-history-csv="${i}">CSV</button></div></article>`).join("");$$('[data-history-open]',el.historyList).forEach(b=>b.addEventListener("click",()=>showHistoryDetail(Number(b.dataset.historyOpen))));$$('[data-history-pdf]',el.historyList).forEach(b=>b.addEventListener("click",()=>runPdfDownload(state.histories[Number(b.dataset.historyPdf)],b,"PDF")));$$('[data-history-csv]',el.historyList).forEach(b=>b.addEventListener("click",()=>runMappingDownload(state.histories[Number(b.dataset.historyCsv)],b)));}

  function showHistory(){el.resultPanel.hidden=true;$$('[data-panel]').forEach(p=>p.hidden=true);el.historyPanel.hidden=false;renderHistory();window.scrollTo({top:110,behavior:"smooth"});}
  function showHistoryDetail(index){
    const record=state.histories[index]; el.historyDetail.hidden=false; el.historyDetail.className="history-detail"; el.historyDetail.innerHTML=`<div class="history-detail-head"><div><p class="step-label">BROWSER-LOCAL SIMULATION</p><h3>${escapeHtml(record.batch_id)}</h3><p>Export snapshot ${escapeHtml(record.snapshot_signature)} is locked. Demo controls never alter PDF, CSV or reprint data.</p></div><button class="text-link" id="closeDetail">Close</button></div><div class="history-search"><input id="cardSearch" type="search" placeholder="Search card ID or recipient ID"><button class="btn compact secondary" id="cardSearchBtn">Search</button></div><div id="cardRecords"></div><h3>Audit events</h3><ul class="audit-list">${record.audit.map(a=>`<li>${new Date(a.timestamp).toLocaleString()} · ${escapeHtml(a.actor)} · ${escapeHtml(a.action)} · ${escapeHtml(a.target)}</li>`).join("")}</ul>`;
    $("#closeDetail").onclick=()=>el.historyDetail.hidden=true;
    const draw=()=>{const q=$("#cardSearch").value.trim().toLowerCase(),cards=[...new Map(record.cards.map(c=>[c.card_id,c])).values()].filter(c=>!q||c.card_id.toLowerCase().includes(q)||c.recipient_id.toLowerCase().includes(q)).slice(0,20);$("#cardRecords").innerHTML=cards.map(c=>{const override=record.demo_overrides[c.card_id]||{},status=override.status||"Active",destination=override.gallery_url||c.gallery_url;return `<div class="card-record"><div><strong>${escapeHtml(c.card_id)}</strong><small>${escapeHtml(c.recipient_id)} · <span class="status-badge ${status==="Revoked"?"error":"valid"}">${escapeHtml(status)}</span></small></div><input value="${escapeAttr(destination)}" aria-label="Demo destination for ${escapeAttr(c.card_id)}"><div class="record-actions"><button class="btn compact secondary" data-update-card="${escapeAttr(c.card_id)}">Change destination</button><button class="btn compact secondary" data-revoke-card="${escapeAttr(c.card_id)}">Revoke</button></div></div>`;}).join("")||"<p>No matching card.</p>";$$('[data-update-card]',el.historyDetail).forEach(b=>b.onclick=()=>updateDemoCard(record,b.dataset.updateCard,b.closest(".card-record").querySelector("input").value,false));$$('[data-revoke-card]',el.historyDetail).forEach(b=>b.onclick=()=>updateDemoCard(record,b.dataset.revokeCard,"",true));};
    $("#cardSearchBtn").onclick=draw; $("#cardSearch").oninput=draw; draw();
  }

  function updateDemoCard(record,cardId,url,revoke){if(!revoke){try{const u=new URL(url);if(u.protocol!=="https:")throw new Error();}catch{return toast("Destination must be a valid HTTPS URL.");}}validateExportSnapshot(record);record.demo_overrides[cardId]={gallery_url:revoke?(record.demo_overrides[cardId]?.gallery_url||record.cards.find(c=>c.card_id===cardId)?.gallery_url):url,status:revoke?"Revoked":"Active"};record.audit.unshift({timestamp:new Date().toISOString(),action:revoke?"qr_revoked_demo":"destination_updated_demo",actor:"demo-user",target:cardId});saveHistory();toast(revoke?"Local revoke recorded. Locked export snapshot is unchanged.":"Local destination changed. Locked export snapshot is unchanged.");showHistoryDetail(state.histories.indexOf(record));}

  function resetBatch(){state.rows=[];state.previewIndex=0;state.currentExport=null;el.urlPaste.value="";el.csvInput.value="";el.resultPanel.hidden=true;renderImport();showStep(1);setStatus("New draft batch started.");}
  function setStatus(message,error=false){el.globalStatus.textContent=message;el.globalStatus.style.color=error?"var(--red)":"var(--muted)";}
  function toast(message){el.toast.textContent=message;el.toast.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.toast.classList.remove("show"),3300);}

  function drawQr(canvas,text,size){
    if(typeof window.qrcode!=="function"){canvas.getContext("2d").clearRect(0,0,canvas.width,canvas.height);return Promise.resolve();}
    try{
      const qr=window.qrcode(0,"M"); qr.addData(String(text)); qr.make(); const modules=qr.getModuleCount(), quiet=4, total=modules+quiet*2, cell=Math.max(1,Math.floor(size/total)), drawn=cell*total, offset=Math.floor((size-drawn)/2), context=canvas.getContext("2d");
      canvas.width=size; canvas.height=size; context.imageSmoothingEnabled=false; context.fillStyle="#ffffff"; context.fillRect(0,0,size,size); context.fillStyle="#000000";
      for(let row=0;row<modules;row++)for(let column=0;column<modules;column++)if(qr.isDark(row,column))context.fillRect(offset+(column+quiet)*cell,offset+(row+quiet)*cell,cell,cell);
      return Promise.resolve();
    }catch(error){return Promise.reject(new Error(`Could not generate QR: ${error.message}`));}
  }
  async function qrDataUrl(text,size){if(typeof window.qrcode!=="function")throw new Error("QR library is unavailable");const canvas=document.createElement("canvas");await drawQr(canvas,text,size);return canvas.toDataURL("image/png");}
  function hash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36).toUpperCase().padStart(7,"0").slice(0,7);}
  function hexToRgb(hex){const n=parseInt(hex.slice(1),16);return[(n>>16)&255,(n>>8)&255,n&255];}
  function safePdfText(value){return String(value??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^\x20-\x7E]/g,"?");}
  function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
  function escapeAttr(value){return escapeHtml(value).replace(/`/g,"&#096;");}
})();
