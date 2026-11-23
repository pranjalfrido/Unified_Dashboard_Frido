// Adds Excel drop-down lists (data validation) to a workbook SheetJS has written. The free
// SheetJS build cannot write data validation, so the sheet XML is edited inside the .xlsx
// zip with fflate, which the project already uses.
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

// <dataValidations> must sit after these elements and before the ones below in a
// worksheet (ECMA-376 CT_Worksheet order), or Excel reports the file as damaged.
const AFTER_VALIDATIONS = ["hyperlinks", "printOptions", "pageMargins", "pageSetup", "headerFooter", "rowBreaks",
  "colBreaks", "customProperties", "cellWatches", "ignoredErrors", "smartTags", "drawing", "legacyDrawing",
  "legacyDrawingHF", "picture", "oleObjects", "controls", "webPublishItems", "tableParts", "extLst"];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// validations: [{ ref: "E2:E50001", values: ["Lost/Damage", "SLA Breach"] }]
export function addListValidations(xlsxBytes, validations, sheetPath = "xl/worksheets/sheet1.xml") {
  if (!validations?.length) return xlsxBytes;
  const files = unzipSync(xlsxBytes);
  if (!files[sheetPath]) throw new Error(`${sheetPath} not found in workbook`);
  let xml = strFromU8(files[sheetPath]);

  const items = validations.map((v) => {
    // Inline lists are comma-separated, max 255 characters, with quotes doubled.
    const list = v.values.map((x) => String(x).replace(/"/g, '""')).join(",");
    if (v.values.some((x) => String(x).includes(","))) throw new Error("Drop-down values cannot contain commas");
    if (list.length > 255) throw new Error("Drop-down list is longer than Excel's 255-character limit");
    return `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Not in the list" ` +
      `error="Pick a value from the drop-down." sqref="${v.ref}"><formula1>"${esc(list)}"</formula1></dataValidation>`;
  });
  const block = `<dataValidations count="${items.length}">${items.join("")}</dataValidations>`;

  const positions = AFTER_VALIDATIONS.map((tag) => xml.search(new RegExp(`<${tag}[\\s/>]`))).filter((i) => i >= 0);
  const at = positions.length ? Math.min(...positions) : xml.lastIndexOf("</worksheet>");
  xml = xml.slice(0, at) + block + xml.slice(at);
  files[sheetPath] = strToU8(xml);
  return zipSync(files);
}
