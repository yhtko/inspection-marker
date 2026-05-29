import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

type Tool = "select" | "highlight" | "balloon" | "text";
type Language = "ja" | "en" | "zh" | "th" | "id" | "vi";
type ColorKey = "yellow" | "green" | "cyan" | "pink" | "orange" | "red" | "black" | "blue" | "white";

type BaseItem = {
  id: string;
  page: number;
  number?: number;
};

type HighlightItem = BaseItem & {
  type: "highlight";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
  labelColor: string;
  labelX?: number;
  labelY?: number;
  fontSize: number;
  note?: string;
};

type BalloonItem = BaseItem & {
  type: "balloon";
  anchorX: number;
  anchorY: number;
  balloonX: number;
  balloonY: number;
  radius: number;
  lineColor: string;
  fillColor: string;
  textColor: string;
  fontSize: number;
  strokeWidth: number;
};

type TextItem = BaseItem & {
  type: "text";
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
};

type MarkItem = HighlightItem | BalloonItem | TextItem;

type DragState =
  | { tool: "highlight"; startX: number; startY: number; currentX: number; currentY: number }
  | { tool: "balloon"; anchorX: number; anchorY: number; currentX: number; currentY: number }
  | { tool: "move"; itemId: string; startX: number; startY: number; original: MarkItem }
  | { tool: "resize-highlight"; itemId: string; handle: "nw" | "ne" | "sw" | "se"; startX: number; startY: number; original: HighlightItem }
  | { tool: "move-highlight-label"; itemId: string }
  | { tool: "move-balloon-anchor"; itemId: string }
  | { tool: "move-balloon-circle"; itemId: string }
  | null;

type ProjectFile = {
  version: 1;
  pdfName: string;
  rotation?: number;
  items: MarkItem[];
};

const languages: { code: Language; label: string }[] = [
  { code: "ja", label: "日本語" },
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
  { code: "th", label: "ไทย" },
  { code: "id", label: "Indonesia" },
  { code: "vi", label: "Tiếng Việt" }
];

const translations: Record<Language, {
  language: string;
  openPdf: string;
  select: string;
  marker: string;
  balloon: string;
  text: string;
  markerColor: string;
  textColor: string;
  lineColor: string;
  fontSize: string;
  opacity: string;
  balloonRadius: string;
  lineWidth: string;
  zoom: string;
  fitPage: string;
  fitWidth: string;
  prevPage: string;
  nextPage: string;
  rotateLeft: string;
  rotateRight: string;
  delete: string;
  clearPage: string;
  savePng: string;
  saveJson: string;
  loadJson: string;
  pdfNotLoaded: string;
  page: string;
  rotation: string;
  marks: string;
  markList: string;
  addMarkHint: string;
  selected: string;
  color: string;
  width: string;
  height: string;
  radius: string;
  strokeWidth: string;
  textInput: string;
  deleteSelected: string;
  selectHint: string;
  promptText: string;
  promptNote: string;
  confirmClearPage: string;
  invalidJson: string;
  itemNames: Record<Tool, string>;
  colors: Record<ColorKey, string>;
}> = {
  ja: {
    language: "言語",
    openPdf: "PDFを開く",
    select: "選択",
    marker: "マーカー",
    balloon: "バルーン",
    text: "文字",
    markerColor: "マーカー色",
    textColor: "文字色",
    lineColor: "線色",
    fontSize: "文字サイズ",
    opacity: "透明度",
    balloonRadius: "バルーン径",
    lineWidth: "線幅",
    zoom: "表示倍率",
    fitPage: "全体FIT",
    fitWidth: "幅FIT",
    prevPage: "前ページ",
    nextPage: "次ページ",
    rotateLeft: "左回転",
    rotateRight: "右回転",
    delete: "削除",
    clearPage: "ページ削除",
    savePng: "PNG保存",
    saveJson: "JSON保存",
    loadJson: "JSON読込",
    pdfNotLoaded: "PDF未読込",
    page: "Page",
    rotation: "Rotation",
    marks: "marks",
    markList: "マーク一覧",
    addMarkHint: "マーカーまたはバルーンを追加",
    selected: "選択中",
    color: "色",
    width: "幅",
    height: "高さ",
    radius: "円径",
    strokeWidth: "線幅",
    textInput: "文字",
    deleteSelected: "選択を削除",
    selectHint: "マークをクリックして選択",
    promptText: "追加する文字を入力してください",
    promptNote: "補足文字があれば入力してください。空欄でOK",
    confirmClearPage: "現在ページのマークをすべて削除しますか？",
    invalidJson: "JSON形式が正しくありません。",
    itemNames: { select: "選択", highlight: "マーカー", balloon: "バルーン", text: "文字" },
    colors: { yellow: "黄", green: "緑", cyan: "水", pink: "桃", orange: "橙", red: "赤", black: "黒", blue: "青", white: "白" }
  },
  en: {
    language: "Language",
    openPdf: "Open PDF",
    select: "Select",
    marker: "Marker",
    balloon: "Balloon",
    text: "Text",
    markerColor: "Marker color",
    textColor: "Text color",
    lineColor: "Line color",
    fontSize: "Text size",
    opacity: "Opacity",
    balloonRadius: "Balloon size",
    lineWidth: "Line width",
    zoom: "Zoom",
    fitPage: "Fit page",
    fitWidth: "Fit width",
    prevPage: "Previous",
    nextPage: "Next",
    rotateLeft: "Rotate left",
    rotateRight: "Rotate right",
    delete: "Delete",
    clearPage: "Clear page",
    savePng: "Save PNG",
    saveJson: "Save JSON",
    loadJson: "Load JSON",
    pdfNotLoaded: "No PDF loaded",
    page: "Page",
    rotation: "Rotation",
    marks: "marks",
    markList: "Mark list",
    addMarkHint: "Add a marker or balloon",
    selected: "Selected",
    color: "Color",
    width: "Width",
    height: "Height",
    radius: "Circle size",
    strokeWidth: "Line width",
    textInput: "Text",
    deleteSelected: "Delete selected",
    selectHint: "Click a mark to select it",
    promptText: "Enter the text to add",
    promptNote: "Enter optional note text. Leave blank if not needed.",
    confirmClearPage: "Delete all marks on the current page?",
    invalidJson: "Invalid JSON format.",
    itemNames: { select: "Select", highlight: "Marker", balloon: "Balloon", text: "Text" },
    colors: { yellow: "Yellow", green: "Green", cyan: "Cyan", pink: "Pink", orange: "Orange", red: "Red", black: "Black", blue: "Blue", white: "White" }
  },
  zh: {
    language: "语言",
    openPdf: "打开PDF",
    select: "选择",
    marker: "标记",
    balloon: "气泡",
    text: "文字",
    markerColor: "标记颜色",
    textColor: "文字颜色",
    lineColor: "线条颜色",
    fontSize: "文字大小",
    opacity: "透明度",
    balloonRadius: "气泡大小",
    lineWidth: "线宽",
    zoom: "缩放",
    fitPage: "适合页面",
    fitWidth: "适合宽度",
    prevPage: "上一页",
    nextPage: "下一页",
    rotateLeft: "向左旋转",
    rotateRight: "向右旋转",
    delete: "删除",
    clearPage: "清除本页",
    savePng: "保存PNG",
    saveJson: "保存JSON",
    loadJson: "读取JSON",
    pdfNotLoaded: "未读取PDF",
    page: "页",
    rotation: "旋转",
    marks: "标记",
    markList: "标记列表",
    addMarkHint: "添加标记或气泡",
    selected: "已选择",
    color: "颜色",
    width: "宽度",
    height: "高度",
    radius: "圆大小",
    strokeWidth: "线宽",
    textInput: "文字",
    deleteSelected: "删除所选",
    selectHint: "点击标记进行选择",
    promptText: "请输入要添加的文字",
    promptNote: "如需补充文字请输入。可留空。",
    confirmClearPage: "删除当前页面上的所有标记？",
    invalidJson: "JSON格式不正确。",
    itemNames: { select: "选择", highlight: "标记", balloon: "气泡", text: "文字" },
    colors: { yellow: "黄", green: "绿", cyan: "青", pink: "粉", orange: "橙", red: "红", black: "黑", blue: "蓝", white: "白" }
  },
  th: {
    language: "ภาษา",
    openPdf: "เปิด PDF",
    select: "เลือก",
    marker: "มาร์ก",
    balloon: "บอลลูน",
    text: "ข้อความ",
    markerColor: "สีมาร์ก",
    textColor: "สีข้อความ",
    lineColor: "สีเส้น",
    fontSize: "ขนาดข้อความ",
    opacity: "ความโปร่งใส",
    balloonRadius: "ขนาดบอลลูน",
    lineWidth: "ความหนาเส้น",
    zoom: "ซูม",
    fitPage: "พอดีหน้า",
    fitWidth: "พอดีกว้าง",
    prevPage: "หน้าก่อน",
    nextPage: "หน้าถัดไป",
    rotateLeft: "หมุนซ้าย",
    rotateRight: "หมุนขวา",
    delete: "ลบ",
    clearPage: "ลบหน้านี้",
    savePng: "บันทึก PNG",
    saveJson: "บันทึก JSON",
    loadJson: "อ่าน JSON",
    pdfNotLoaded: "ยังไม่ได้เปิด PDF",
    page: "หน้า",
    rotation: "หมุน",
    marks: "มาร์ก",
    markList: "รายการมาร์ก",
    addMarkHint: "เพิ่มมาร์กหรือบอลลูน",
    selected: "ที่เลือก",
    color: "สี",
    width: "กว้าง",
    height: "สูง",
    radius: "ขนาดวงกลม",
    strokeWidth: "ความหนาเส้น",
    textInput: "ข้อความ",
    deleteSelected: "ลบที่เลือก",
    selectHint: "คลิกมาร์กเพื่อเลือก",
    promptText: "ป้อนข้อความที่จะเพิ่ม",
    promptNote: "ป้อนข้อความเสริมถ้ามี เว้นว่างได้",
    confirmClearPage: "ลบมาร์กทั้งหมดในหน้านี้หรือไม่?",
    invalidJson: "รูปแบบ JSON ไม่ถูกต้อง",
    itemNames: { select: "เลือก", highlight: "มาร์ก", balloon: "บอลลูน", text: "ข้อความ" },
    colors: { yellow: "เหลือง", green: "เขียว", cyan: "ฟ้า", pink: "ชมพู", orange: "ส้ม", red: "แดง", black: "ดำ", blue: "น้ำเงิน", white: "ขาว" }
  },
  id: {
    language: "Bahasa",
    openPdf: "Buka PDF",
    select: "Pilih",
    marker: "Marker",
    balloon: "Balon",
    text: "Teks",
    markerColor: "Warna marker",
    textColor: "Warna teks",
    lineColor: "Warna garis",
    fontSize: "Ukuran teks",
    opacity: "Transparansi",
    balloonRadius: "Ukuran balon",
    lineWidth: "Tebal garis",
    zoom: "Zoom",
    fitPage: "Pas halaman",
    fitWidth: "Pas lebar",
    prevPage: "Sebelumnya",
    nextPage: "Berikutnya",
    rotateLeft: "Putar kiri",
    rotateRight: "Putar kanan",
    delete: "Hapus",
    clearPage: "Hapus halaman",
    savePng: "Simpan PNG",
    saveJson: "Simpan JSON",
    loadJson: "Muat JSON",
    pdfNotLoaded: "PDF belum dibuka",
    page: "Hal.",
    rotation: "Rotasi",
    marks: "mark",
    markList: "Daftar mark",
    addMarkHint: "Tambahkan marker atau balon",
    selected: "Terpilih",
    color: "Warna",
    width: "Lebar",
    height: "Tinggi",
    radius: "Ukuran lingkaran",
    strokeWidth: "Tebal garis",
    textInput: "Teks",
    deleteSelected: "Hapus pilihan",
    selectHint: "Klik mark untuk memilih",
    promptText: "Masukkan teks yang akan ditambahkan",
    promptNote: "Masukkan catatan jika perlu. Boleh kosong.",
    confirmClearPage: "Hapus semua mark di halaman ini?",
    invalidJson: "Format JSON tidak valid.",
    itemNames: { select: "Pilih", highlight: "Marker", balloon: "Balon", text: "Teks" },
    colors: { yellow: "Kuning", green: "Hijau", cyan: "Biru muda", pink: "Merah muda", orange: "Oranye", red: "Merah", black: "Hitam", blue: "Biru", white: "Putih" }
  },
  vi: {
    language: "Ngôn ngữ",
    openPdf: "Mở PDF",
    select: "Chọn",
    marker: "Đánh dấu",
    balloon: "Bóng",
    text: "Chữ",
    markerColor: "Màu đánh dấu",
    textColor: "Màu chữ",
    lineColor: "Màu đường",
    fontSize: "Cỡ chữ",
    opacity: "Độ trong suốt",
    balloonRadius: "Cỡ bóng",
    lineWidth: "Độ dày đường",
    zoom: "Thu phóng",
    fitPage: "Vừa trang",
    fitWidth: "Vừa rộng",
    prevPage: "Trang trước",
    nextPage: "Trang sau",
    rotateLeft: "Xoay trái",
    rotateRight: "Xoay phải",
    delete: "Xóa",
    clearPage: "Xóa trang",
    savePng: "Lưu PNG",
    saveJson: "Lưu JSON",
    loadJson: "Đọc JSON",
    pdfNotLoaded: "Chưa mở PDF",
    page: "Trang",
    rotation: "Xoay",
    marks: "dấu",
    markList: "Danh sách dấu",
    addMarkHint: "Thêm đánh dấu hoặc bóng",
    selected: "Đang chọn",
    color: "Màu",
    width: "Rộng",
    height: "Cao",
    radius: "Cỡ vòng tròn",
    strokeWidth: "Độ dày đường",
    textInput: "Chữ",
    deleteSelected: "Xóa mục chọn",
    selectHint: "Bấm vào dấu để chọn",
    promptText: "Nhập chữ cần thêm",
    promptNote: "Nhập ghi chú nếu cần. Có thể để trống.",
    confirmClearPage: "Xóa tất cả dấu trên trang hiện tại?",
    invalidJson: "Định dạng JSON không đúng.",
    itemNames: { select: "Chọn", highlight: "Đánh dấu", balloon: "Bóng", text: "Chữ" },
    colors: { yellow: "Vàng", green: "Xanh lá", cyan: "Xanh ngọc", pink: "Hồng", orange: "Cam", red: "Đỏ", black: "Đen", blue: "Xanh dương", white: "Trắng" }
  }
};

const markerColors = [
  { key: "yellow", value: "#fff36d" },
  { key: "green", value: "#8df0a4" },
  { key: "cyan", value: "#7edbff" },
  { key: "pink", value: "#ff9bd2" },
  { key: "orange", value: "#ffb45f" },
  { key: "red", value: "#ff7373" }
] satisfies { key: ColorKey; value: string }[];

const textColors = [
  { key: "red", value: "#e60000" },
  { key: "black", value: "#111111" },
  { key: "blue", value: "#005bd6" },
  { key: "green", value: "#00803b" },
  { key: "white", value: "#ffffff" }
] satisfies { key: ColorKey; value: string }[];

const lineColors = [
  { key: "red", value: "#e60000" },
  { key: "black", value: "#111111" },
  { key: "blue", value: "#005bd6" },
  { key: "green", value: "#00803b" }
] satisfies { key: ColorKey; value: string }[];

function isNumberedItem(item: MarkItem): item is HighlightItem | BalloonItem {
  return item.type === "highlight" || item.type === "balloon";
}

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function normalizeRect(x0: number, y0: number, x1: number, y1: number) {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0)
  };
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [language, setLanguage] = useState<Language>("ja");
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfName, setPdfName] = useState("drawing");
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(1.6);
  const [rotation, setRotation] = useState(0);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [tool, setTool] = useState<Tool>("highlight");
  const [items, setItems] = useState<MarkItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [draggingListId, setDraggingListId] = useState<string | null>(null);

  const [markerColor, setMarkerColor] = useState("#fff36d");
  const [markerOpacity, setMarkerOpacity] = useState(0.45);
  const [textColor, setTextColor] = useState("#e60000");
  const [lineColor, setLineColor] = useState("#e60000");
  const [fontSize, setFontSize] = useState(16);
  const [balloonRadius, setBalloonRadius] = useState(18);
  const [lineWidth, setLineWidth] = useState(2);
  const t = translations[language];

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const stageWrapRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const pageItems = useMemo(
    () => items.filter((item) => item.page === pageNumber),
    [items, pageNumber]
  );

  const numberedCount = useMemo(
    () => items.filter(isNumberedItem).length,
    [items]
  );

  const numberedItems = useMemo(
    () => items.filter(isNumberedItem).sort((a, b) => (a.number ?? 0) - (b.number ?? 0)),
    [items]
  );

  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;
    const page: PDFPageProxy = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale, rotation });
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;

    const outputScale = Math.max(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    setPageSize({ width: viewport.width, height: viewport.height });

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvas,
      canvasContext: context,
      viewport,
      transform: [outputScale, 0, 0, outputScale, 0, 0]
    }).promise;
  }, [pdfDoc, pageNumber, scale, rotation]);

  useEffect(() => {
    void renderPage();
  }, [renderPage]);

  const toPagePoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale
    };
  };

  const openPdf = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: buffer, disableWorker: true } as unknown as Parameters<typeof pdfjsLib.getDocument>[0]);
    const doc = await loadingTask.promise;
    setPdfDoc(doc);
    setPdfName(file.name.replace(/\.pdf$/i, ""));
    setPageNumber(1);
    setPageCount(doc.numPages);
    setItems([]);
    setSelectedId(null);
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!pdfDoc) return;
    const point = toPagePoint(event.clientX, event.clientY);
    setSelectedId(null);

    if (tool === "highlight") {
      setDrag({ tool: "highlight", startX: point.x, startY: point.y, currentX: point.x, currentY: point.y });
      return;
    }

    if (tool === "balloon") {
      setDrag({ tool: "balloon", anchorX: point.x, anchorY: point.y, currentX: point.x, currentY: point.y });
      return;
    }

    if (tool === "text") {
      const text = window.prompt(t.promptText);
      if (!text) return;
      setItems((current) => [
        ...current,
        {
          id: makeId(),
          type: "text",
          page: pageNumber,
          x: point.x,
          y: point.y,
          text,
          color: textColor,
          fontSize
        }
      ]);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const point = toPagePoint(event.clientX, event.clientY);
    if (drag.tool === "highlight") {
      setDrag({ ...drag, currentX: point.x, currentY: point.y });
    } else if (drag.tool === "balloon") {
      setDrag({ ...drag, currentX: point.x, currentY: point.y });
    } else if (drag.tool === "move") {
      const dx = point.x - drag.startX;
      const dy = point.y - drag.startY;
      const original = drag.original;
      setItems((current) =>
        current.map((item) => {
          if (item.id !== drag.itemId) return item;
          if (original.type === "highlight") {
            return {
              ...original,
              x: original.x + dx,
              y: original.y + dy,
              labelX: original.labelX === undefined ? undefined : original.labelX + dx,
              labelY: original.labelY === undefined ? undefined : original.labelY + dy
            };
          }
          if (original.type === "balloon") {
            return {
              ...original,
              anchorX: original.anchorX + dx,
              anchorY: original.anchorY + dy,
              balloonX: original.balloonX + dx,
              balloonY: original.balloonY + dy
            };
          }
          return { ...original, x: original.x + dx, y: original.y + dy };
        })
      );
    } else if (drag.tool === "resize-highlight") {
      const original = drag.original;
      let x0 = original.x;
      let y0 = original.y;
      let x1 = original.x + original.width;
      let y1 = original.y + original.height;
      if (drag.handle.includes("n")) y0 = point.y;
      if (drag.handle.includes("s")) y1 = point.y;
      if (drag.handle.includes("w")) x0 = point.x;
      if (drag.handle.includes("e")) x1 = point.x;
      const rect = normalizeRect(x0, y0, x1, y1);
      setItems((current) => current.map((item) => (item.id === drag.itemId ? { ...original, ...rect } : item)));
    } else if (drag.tool === "move-highlight-label") {
      setItems((current) =>
        current.map((item) => item.id === drag.itemId && item.type === "highlight" ? { ...item, labelX: point.x, labelY: point.y } : item)
      );
    } else if (drag.tool === "move-balloon-anchor") {
      setItems((current) =>
        current.map((item) => item.id === drag.itemId && item.type === "balloon" ? { ...item, anchorX: point.x, anchorY: point.y } : item)
      );
    } else if (drag.tool === "move-balloon-circle") {
      setItems((current) =>
        current.map((item) => item.id === drag.itemId && item.type === "balloon" ? { ...item, balloonX: point.x, balloonY: point.y } : item)
      );
    }
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const point = toPagePoint(event.clientX, event.clientY);

    if (drag.tool !== "highlight" && drag.tool !== "balloon") {
      setDrag(null);
      return;
    }

    if (drag.tool === "highlight") {
      const rect = normalizeRect(drag.startX, drag.startY, point.x, point.y);
      setDrag(null);
      if (rect.width < 4 || rect.height < 4) return;
      const note = window.prompt(t.promptNote) ?? "";
      const labelX = rect.x + rect.width + 6;
      const labelY = Math.max(12, rect.y - 4);
      setItems((current) => [
        ...current,
        {
          id: makeId(),
          type: "highlight",
          page: pageNumber,
          number: numberedCount + 1,
          ...rect,
          color: markerColor,
          opacity: markerOpacity,
          labelColor: textColor,
          labelX,
          labelY,
          fontSize,
          note
        }
      ]);
      return;
    }

    if (drag.tool === "balloon") {
      setDrag(null);
      const distance = Math.hypot(point.x - drag.anchorX, point.y - drag.anchorY);
      if (distance < 8) return;
      setItems((current) => [
        ...current,
        {
          id: makeId(),
          type: "balloon",
          page: pageNumber,
          number: numberedCount + 1,
          anchorX: drag.anchorX,
          anchorY: drag.anchorY,
          balloonX: point.x,
          balloonY: point.y,
          radius: balloonRadius,
          lineColor,
          fillColor: "#ffffff",
          textColor,
          fontSize,
          strokeWidth: lineWidth
        }
      ]);
    }
  };

  const renumber = (nextItems: MarkItem[]) => {
    let number = 1;
    return nextItems.map((item) => {
      if (item.type === "highlight" || item.type === "balloon") {
        return { ...item, number: number++ };
      }
      return item;
    });
  };

  const deleteSelected = () => {
    if (!selectedId) {
      const last = [...pageItems].reverse().find((item) => item.type !== "text" || item.page === pageNumber);
      if (!last) return;
      setItems((current) => renumber(current.filter((item) => item.id !== last.id)));
      return;
    }
    setItems((current) => renumber(current.filter((item) => item.id !== selectedId)));
    setSelectedId(null);
  };

  const deleteItem = (id: string) => {
    setItems((current) => renumber(current.filter((item) => item.id !== id)));
    if (selectedId === id) {
      setSelectedId(null);
    }
  };

  const clearPage = () => {
    if (!window.confirm(t.confirmClearPage)) return;
    setItems((current) => renumber(current.filter((item) => item.page !== pageNumber)));
    setSelectedId(null);
  };

  const rotateLeft = () => {
    setRotation((current) => (current + 270) % 360);
    setSelectedId(null);
  };

  const rotateRight = () => {
    setRotation((current) => (current + 90) % 360);
    setSelectedId(null);
  };

  const fitPage = async (mode: "page" | "width") => {
    if (!pdfDoc || !stageWrapRef.current) return;
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1, rotation });
    const wrap = stageWrapRef.current;
    const padding = 40;
    const availableWidth = Math.max(100, wrap.clientWidth - padding);
    const availableHeight = Math.max(100, wrap.clientHeight - padding);
    const widthScale = availableWidth / viewport.width;
    const heightScale = availableHeight / viewport.height;
    const nextScale = mode === "width" ? widthScale : Math.min(widthScale, heightScale);
    setScale(Math.min(4, Math.max(0.1, Number(nextScale.toFixed(2)))));
  };

  const handleWheel = (event: React.WheelEvent<HTMLElement>) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    setScale((current) => {
      const next = current + direction * 0.1;
      return Math.min(4, Math.max(0.4, Number(next.toFixed(2))));
    });
  };

  const saveProject = () => {
    const project: ProjectFile = { version: 1, pdfName, rotation, items };
    downloadBlob(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }), `${pdfName}_marks.json`);
  };

  const loadProject = async (file: File) => {
    const text = await file.text();
    const project = JSON.parse(text) as ProjectFile;
    if (!Array.isArray(project.items)) {
      window.alert(t.invalidJson);
      return;
    }
    setItems(project.items);
    if (typeof project.rotation === "number") {
      setRotation(project.rotation);
    }
  };

  const exportCurrentPng = async () => {
    const canvas = canvasRef.current;
    const svg = svgRef.current;
    if (!canvas || !svg) return;

    const output = document.createElement("canvas");
    output.width = canvas.width;
    output.height = canvas.height;
    const context = output.getContext("2d");
    if (!context) return;
    context.drawImage(canvas, 0, 0);

    const svgClone = svg.cloneNode(true) as SVGSVGElement;
    svgClone.setAttribute("width", String(output.width));
    svgClone.setAttribute("height", String(output.height));
    svgClone.setAttribute("viewBox", `0 0 ${pageSize.width} ${pageSize.height}`);
    const serialized = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = reject;
      image.src = svgUrl;
    });
    context.drawImage(image, 0, 0);
    URL.revokeObjectURL(svgUrl);

    output.toBlob((blob) => {
      if (!blob) return;
      downloadBlob(blob, `${pdfName}_page${pageNumber}_marked.png`);
    }, "image/png");
  };

  const selectedItem = items.find((item) => item.id === selectedId) ?? null;

  const updateSelectedColor = (color: string) => {
    if (!selectedId) return;
    setItems((current) =>
      current.map((item) => {
        if (item.id !== selectedId) return item;
        if (item.type === "highlight") return { ...item, color };
        if (item.type === "balloon") return { ...item, lineColor: color };
        return { ...item, color };
      })
    );
  };

  const updateSelectedItem = (patch: Partial<HighlightItem> | Partial<BalloonItem> | Partial<TextItem>) => {
    if (!selectedId) return;
    setItems((current) =>
      current.map((item) => (item.id === selectedId ? ({ ...item, ...patch } as MarkItem) : item))
    );
  };

  const startMoveItem = (item: MarkItem, point: { x: number; y: number }) => {
    setSelectedId(item.id);
    setDrag({ tool: "move", itemId: item.id, startX: point.x, startY: point.y, original: item });
  };

  const startResizeHighlight = (item: HighlightItem, handle: "nw" | "ne" | "sw" | "se") => {
    setSelectedId(item.id);
    setDrag({ tool: "resize-highlight", itemId: item.id, handle, startX: 0, startY: 0, original: item });
  };

  const startMoveHighlightLabel = (item: HighlightItem) => {
    setSelectedId(item.id);
    setDrag({ tool: "move-highlight-label", itemId: item.id });
  };

  const startMoveBalloonPart = (item: BalloonItem, part: "anchor" | "circle") => {
    setSelectedId(item.id);
    setDrag({ tool: part === "anchor" ? "move-balloon-anchor" : "move-balloon-circle", itemId: item.id });
  };

  const reorderNumberedItems = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const ordered = [...numberedItems];
    const sourceIndex = ordered.findIndex((item) => item.id === sourceId);
    const targetIndex = ordered.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const [moved] = ordered.splice(sourceIndex, 1);
    ordered.splice(targetIndex, 0, moved);
    const renumbered = ordered.map((item, index) => ({ ...item, number: index + 1 }));
    const renumberedMap = new Map(renumbered.map((item) => [item.id, item]));
    setItems((current) => current.map((item) => renumberedMap.get(item.id) ?? item));
  };

  return (
    <div className="app-shell">
      <aside className="toolbar">
        <div className="brand">Inspection Marker</div>

        <label>
          {t.language}
          <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
            {languages.map((entry) => <option key={entry.code} value={entry.code}>{entry.label}</option>)}
          </select>
        </label>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void openPdf(file);
          }}
        />
        <button className="primary" onClick={() => fileInputRef.current?.click()}>{t.openPdf}</button>

        <div className="tool-group">
          <button className={tool === "select" ? "active" : ""} onClick={() => setTool("select")}>{t.select}</button>
          <button className={tool === "highlight" ? "active" : ""} onClick={() => setTool("highlight")}>{t.marker}</button>
          <button className={tool === "balloon" ? "active" : ""} onClick={() => setTool("balloon")}>{t.balloon}</button>
          <button className={tool === "text" ? "active" : ""} onClick={() => setTool("text")}>{t.text}</button>
        </div>

        <label>
          {t.markerColor}
          <select value={markerColor} onChange={(event) => setMarkerColor(event.target.value)}>
            {markerColors.map((color) => <option key={color.value} value={color.value}>{t.colors[color.key]}</option>)}
          </select>
        </label>

        <label>
          {t.textColor}
          <select value={textColor} onChange={(event) => setTextColor(event.target.value)}>
            {textColors.map((color) => <option key={color.value} value={color.value}>{t.colors[color.key]}</option>)}
          </select>
        </label>

        <label>
          {t.lineColor}
          <select value={lineColor} onChange={(event) => setLineColor(event.target.value)}>
            {lineColors.map((color) => <option key={color.value} value={color.value}>{t.colors[color.key]}</option>)}
          </select>
        </label>

        <label>
          {t.fontSize}
          <input type="number" min="8" max="48" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} />
        </label>

        <label>
          {t.opacity}
          <input type="range" min="0.15" max="0.8" step="0.05" value={markerOpacity} onChange={(event) => setMarkerOpacity(Number(event.target.value))} />
        </label>

        <label>
          {t.balloonRadius}
          <input type="number" min="8" max="60" value={balloonRadius} onChange={(event) => setBalloonRadius(Number(event.target.value))} />
        </label>

        <label>
          {t.lineWidth}
          <input type="number" min="1" max="8" value={lineWidth} onChange={(event) => setLineWidth(Number(event.target.value))} />
        </label>

        <label>
          {t.zoom}
          <input type="range" min="0.1" max="4" step="0.05" value={scale} onChange={(event) => setScale(Number(event.target.value))} />
        </label>

        <div className="tool-group">
          <button disabled={!pdfDoc} onClick={() => void fitPage("page")}>{t.fitPage}</button>
          <button disabled={!pdfDoc} onClick={() => void fitPage("width")}>{t.fitWidth}</button>
        </div>

        <div className="tool-group">
          <button disabled={!pdfDoc || pageNumber <= 1} onClick={() => setPageNumber((page) => page - 1)}>{t.prevPage}</button>
          <button disabled={!pdfDoc || pageNumber >= pageCount} onClick={() => setPageNumber((page) => page + 1)}>{t.nextPage}</button>
        </div>

        <div className="tool-group">
          <button disabled={!pdfDoc} onClick={rotateLeft}>{t.rotateLeft}</button>
          <button disabled={!pdfDoc} onClick={rotateRight}>{t.rotateRight}</button>
        </div>

        <div className="tool-group">
          <button onClick={deleteSelected} disabled={!pdfDoc}>{t.delete}</button>
          <button onClick={clearPage} disabled={!pdfDoc}>{t.clearPage}</button>
        </div>

        <div className="tool-group">
          <button onClick={exportCurrentPng} disabled={!pdfDoc}>{t.savePng}</button>
          <button onClick={saveProject} disabled={!pdfDoc}>{t.saveJson}</button>
        </div>

        <label className="file-label">
          {t.loadJson}
          <input type="file" accept="application/json" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void loadProject(file);
          }} />
        </label>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <span>{pdfDoc ? `${pdfName}.pdf` : t.pdfNotLoaded}</span>
          <span>{pdfDoc ? `${t.page} ${pageNumber} / ${pageCount}` : ""}</span>
          <span>{pdfDoc ? `${t.rotation} ${rotation}°` : ""}</span>
          <span>{items.filter((item) => item.type === "highlight" || item.type === "balloon").length} {t.marks}</span>
        </header>

        <section ref={stageWrapRef} className="stage-wrap" onWheel={handleWheel}>
          {!pdfDoc && (
            <div className="empty-state">
              <button className="primary large" onClick={() => fileInputRef.current?.click()}>{t.openPdf}</button>
            </div>
          )}

          <div className="page-stage" style={{ width: pageSize.width, height: pageSize.height }}>
            <canvas ref={canvasRef} />
            <svg
              ref={svgRef}
              className="overlay"
              width={pageSize.width}
              height={pageSize.height}
              viewBox={`0 0 ${pageSize.width} ${pageSize.height}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              <g transform={`scale(${scale})`}>
                {pageItems.map((item) => (
                  <OverlayItem
                    key={item.id}
                    item={item}
                    selected={item.id === selectedId}
                    onSelect={setSelectedId}
                    onStartMove={(targetItem, event) => startMoveItem(targetItem, toPagePoint(event.clientX, event.clientY))}
                    onStartResize={startResizeHighlight}
                    onStartMoveHighlightLabel={startMoveHighlightLabel}
                    onStartMoveBalloonPart={startMoveBalloonPart}
                  />
                ))}
                {drag?.tool === "highlight" && (
                  <rect
                    {...normalizeRect(drag.startX, drag.startY, drag.currentX, drag.currentY)}
                    fill={markerColor}
                    opacity={markerOpacity}
                    stroke="#d1a900"
                    strokeWidth={1 / scale}
                  />
                )}
                {drag?.tool === "balloon" && (
                  <g>
                    <line x1={drag.anchorX} y1={drag.anchorY} x2={drag.currentX} y2={drag.currentY} stroke={lineColor} strokeWidth={lineWidth} />
                    <circle cx={drag.currentX} cy={drag.currentY} r={balloonRadius} fill="#ffffff" stroke={lineColor} strokeWidth={lineWidth} />
                  </g>
                )}
              </g>
            </svg>
          </div>
        </section>
      </main>

      <aside className="properties">
        <h2>{t.markList}</h2>
        <div className="mark-list">
          {numberedItems.length === 0 ? (
            <p>{t.addMarkHint}</p>
          ) : (
            numberedItems.map((item) => (
              <button
                key={item.id}
                className={item.id === selectedId ? "mark-row active" : "mark-row"}
                draggable
                onClick={() => {
                  setSelectedId(item.id);
                  setPageNumber(item.page);
                }}
                onDragStart={() => setDraggingListId(item.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggingListId) reorderNumberedItems(draggingListId, item.id);
                  setDraggingListId(null);
                }}
              >
                <span>No.{item.number}</span>
                <span>{item.type === "highlight" ? t.itemNames.highlight : t.itemNames.balloon}</span>
                <span>p.{item.page}</span>
                <span
                  role="button"
                  tabIndex={0}
                  className="trash-button"
                  title={t.delete}
                  onClick={(event) => {
                    event.stopPropagation();
                    deleteItem(item.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      deleteItem(item.id);
                    }
                  }}
                >
                  {t.delete}
                </span>
              </button>
            ))
          )}
        </div>

        <h2>{t.selected}</h2>
        {selectedItem ? (
          <>
            <div className="property-line">{t.itemNames[selectedItem.type]}</div>
            {"number" in selectedItem && selectedItem.number ? <div className="property-line">No.{selectedItem.number}</div> : null}
            <div className="palette-block">
              <div className="palette-label">{t.color}</div>
              <div className="palette-grid">
                {[...markerColors, ...textColors, ...lineColors]
                  .filter((color, index, array) => array.findIndex((entry) => entry.value === color.value) === index)
                  .map((color) => (
                    <button
                      key={color.value}
                      className="color-swatch"
                      title={t.colors[color.key]}
                      style={{ backgroundColor: color.value }}
                      onClick={() => updateSelectedColor(color.value)}
                    />
                  ))}
              </div>
            </div>
            {selectedItem.type === "highlight" ? (
              <>
                <label>{t.width}<input type="number" min="1" value={Math.round(selectedItem.width)} onChange={(event) => updateSelectedItem({ width: Number(event.target.value) })} /></label>
                <label>{t.height}<input type="number" min="1" value={Math.round(selectedItem.height)} onChange={(event) => updateSelectedItem({ height: Number(event.target.value) })} /></label>
                <label>{t.fontSize}<input type="number" min="8" max="64" value={selectedItem.fontSize} onChange={(event) => updateSelectedItem({ fontSize: Number(event.target.value) })} /></label>
              </>
            ) : null}
            {selectedItem.type === "balloon" ? (
              <>
                <label>{t.radius}<input type="number" min="4" max="80" value={selectedItem.radius} onChange={(event) => updateSelectedItem({ radius: Number(event.target.value) })} /></label>
                <label>{t.strokeWidth}<input type="number" min="1" max="10" value={selectedItem.strokeWidth} onChange={(event) => updateSelectedItem({ strokeWidth: Number(event.target.value) })} /></label>
                <label>{t.fontSize}<input type="number" min="8" max="64" value={selectedItem.fontSize} onChange={(event) => updateSelectedItem({ fontSize: Number(event.target.value) })} /></label>
              </>
            ) : null}
            {selectedItem.type === "text" ? (
              <>
                <label>{t.textInput}<input type="text" value={selectedItem.text} onChange={(event) => updateSelectedItem({ text: event.target.value })} /></label>
                <label>{t.fontSize}<input type="number" min="8" max="64" value={selectedItem.fontSize} onChange={(event) => updateSelectedItem({ fontSize: Number(event.target.value) })} /></label>
              </>
            ) : null}
            <button className="danger" onClick={deleteSelected}>{t.deleteSelected}</button>
          </>
        ) : (
          <p>{t.selectHint}</p>
        )}
      </aside>
    </div>
  );
}

function OverlayItem({
  item,
  selected,
  onSelect,
  onStartMove,
  onStartResize,
  onStartMoveHighlightLabel,
  onStartMoveBalloonPart
}: {
  item: MarkItem;
  selected: boolean;
  onSelect: (id: string) => void;
  onStartMove: (item: MarkItem, event: React.PointerEvent) => void;
  onStartResize: (item: HighlightItem, handle: "nw" | "ne" | "sw" | "se") => void;
  onStartMoveHighlightLabel: (item: HighlightItem) => void;
  onStartMoveBalloonPart: (item: BalloonItem, part: "anchor" | "circle") => void;
}) {
  const common = {
    onPointerDown: (event: React.PointerEvent) => {
      event.stopPropagation();
      onSelect(item.id);
      onStartMove(item, event);
    },
    className: selected ? "svg-item selected" : "svg-item"
  };

  if (item.type === "highlight") {
    const labelX = item.labelX ?? item.x + item.width + 6;
    const labelY = item.labelY ?? Math.max(12, item.y - 4);
    return (
      <g {...common}>
        <rect x={item.x} y={item.y} width={item.width} height={item.height} fill={item.color} opacity={item.opacity} stroke="#d1a900" strokeWidth={1} />
        <text
          className="label-handle"
          x={labelX}
          y={labelY}
          fill={item.labelColor}
          fontSize={item.fontSize}
          fontWeight="700"
          onPointerDown={(event) => {
            event.stopPropagation();
            onSelect(item.id);
            onStartMoveHighlightLabel(item);
          }}
        >
          No.{item.number}
        </text>
        {item.note ? <text x={item.x} y={item.y + item.height + item.fontSize + 4} fill={item.labelColor} fontSize={item.fontSize}>{item.note}</text> : null}
        {selected ? (
          <>
            {(["nw", "ne", "sw", "se"] as const).map((handle) => {
              const x = handle.includes("w") ? item.x : item.x + item.width;
              const y = handle.includes("n") ? item.y : item.y + item.height;
              return (
                <rect
                  key={handle}
                  className="resize-handle"
                  x={x - 4}
                  y={y - 4}
                  width={8}
                  height={8}
                  fill="#ffffff"
                  stroke="#1f6feb"
                  strokeWidth={1.5}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    onStartResize(item, handle);
                  }}
                />
              );
            })}
          </>
        ) : null}
      </g>
    );
  }

  if (item.type === "balloon") {
    return (
      <g {...common}>
        <circle cx={item.anchorX} cy={item.anchorY} r={3} fill={item.lineColor} />
        <line x1={item.anchorX} y1={item.anchorY} x2={item.balloonX} y2={item.balloonY} stroke={item.lineColor} strokeWidth={item.strokeWidth} />
        <circle cx={item.balloonX} cy={item.balloonY} r={item.radius} fill={item.fillColor} stroke={item.lineColor} strokeWidth={item.strokeWidth} />
        <text x={item.balloonX} y={item.balloonY + item.fontSize * 0.34} fill={item.textColor} fontSize={item.fontSize} fontWeight="700" textAnchor="middle">{
          item.number
        }</text>
        {selected ? (
          <>
            <circle
              className="resize-handle"
              cx={item.anchorX}
              cy={item.anchorY}
              r={6}
              fill="#ffffff"
              stroke="#1f6feb"
              strokeWidth={1.5}
              onPointerDown={(event) => {
                event.stopPropagation();
                onStartMoveBalloonPart(item, "anchor");
              }}
            />
            <circle
              className="resize-handle"
              cx={item.balloonX}
              cy={item.balloonY}
              r={item.radius + 5}
              fill="transparent"
              stroke="#1f6feb"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              onPointerDown={(event) => {
                event.stopPropagation();
                onStartMoveBalloonPart(item, "circle");
              }}
            />
          </>
        ) : null}
      </g>
    );
  }

  return (
    <text {...common} x={item.x} y={item.y} fill={item.color} fontSize={item.fontSize} fontWeight="700">
      {item.text}
    </text>
  );
}
