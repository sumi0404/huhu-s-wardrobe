import React, { useState, useEffect, useMemo } from "react";
import {
  Camera,
  Plus,
  Tag,
  Ruler,
  AlignLeft,
  Trash2,
  Edit2,
  Share2,
  Image as ImageIcon,
  CheckCircle,
  Info,
  X,
  XCircle,
} from "lucide-react";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";

// ==========================================
// 這是你專屬的 Firebase 金鑰
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyASqi3nahicqwgAzigrAKfcIioro253nSE",
  authDomain: "huhu-2d10a.firebaseapp.com",
  projectId: "huhu-2d10a",
  storageBucket: "huhu-2d10a.firebasestorage.app",
  messagingSenderId: "164114132358",
  appId: "1:164114132358:web:001188f92ae6c79e48d007",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "my-wardrobe-app";

export default function App() {
  const [user, setUser] = useState(null);
  const [clothes, setClothes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [viewUid] = useState(() =>
    new URLSearchParams(window.location.search).get("view")
  );
  const isReadOnly = viewUid && (!user || viewUid !== user.uid);

  const [filterBrand, setFilterBrand] = useState("全部");
  const [filterStatus, setFilterStatus] = useState("全部");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const [headerInfo, setHeaderInfo] = useState({
    title: "My Wardrobe",
    subtitle: "兒童服飾與穿搭紀錄本",
  });
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [editHeaderInfo, setEditHeaderInfo] = useState({
    title: "",
    subtitle: "",
  });

  const [selectedItem, setSelectedItem] = useState(null);

  const defaultFormState = {
    brand: "",
    size: "",
    season: "四季",
    status: "未售出",
    notes: "",
    image: null,
    additionalImages: [],
  };
  const [newItem, setNewItem] = useState(defaultFormState);

  // --- Firebase 驗證與讀取 ---
  useEffect(() => {
    signInAnonymously(auth).catch((err) => console.error("登入失敗:", err));
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    const targetUid = viewUid || user.uid;

    const clothesRef = collection(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      `wardrobe_${targetUid}`
    );
    const unsubscribeClothes = onSnapshot(
      clothesRef,
      (snapshot) => {
        const data = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .sort((a, b) => b.createdAt - a.createdAt);
        setClothes(data);
        setIsLoading(false);
      },
      (error) => {
        console.error("讀取資料失敗:", error);
        setIsLoading(false);
      }
    );

    const settingsRef = doc(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      `wardrobe_settings_${targetUid}`,
      "header"
    );
    const unsubscribeSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) setHeaderInfo(docSnap.data());
    });

    return () => {
      unsubscribeClothes();
      unsubscribeSettings();
    };
  }, [user, viewUid]);

  // --- 篩選 ---
  const brands = useMemo(() => {
    const allBrands = clothes
      .map((c) => c.brand)
      .filter((b) => b && b.trim() !== "");
    return ["全部", ...new Set(allBrands)];
  }, [clothes]);

  const filteredClothes = useMemo(() => {
    return clothes.filter((c) => {
      return (
        (filterBrand === "全部" || c.brand === filterBrand) &&
        (filterStatus === "全部" || c.status === filterStatus)
      );
    });
  }, [clothes, filterBrand, filterStatus]);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3000);
  };

  const handleSaveHeader = async () => {
    try {
      await setDoc(
        doc(
          db,
          "artifacts",
          appId,
          "public",
          "data",
          `wardrobe_settings_${user.uid}`,
          "header"
        ),
        {
          title: editHeaderInfo.title || "My Wardrobe",
          subtitle: editHeaderInfo.subtitle || "兒童服飾與穿搭紀錄本",
          updatedAt: Date.now(),
        },
        { merge: true }
      );
      setIsEditingHeader(false);
      showToast("✅ 已成功更新標題！");
    } catch (error) {
      showToast("更新標題失敗，請重試。");
    }
  };

  const compressImage = (file, maxSize = 800) => {
    return new Promise((resolve) => {
      if (!file.type.startsWith("image/")) {
        showToast("請上傳正確的圖片格式喔！");
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width,
            height = img.height;
          if (width > height && width > maxSize) {
            height *= maxSize / width;
            width = maxSize;
          } else if (height > maxSize) {
            width *= maxSize / height;
            height = maxSize;
          }
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.65));
        };
        img.onerror = () => {
          showToast("圖片解析失敗。");
          resolve(null);
        };
      };
      reader.onerror = () => {
        showToast("讀取檔案失敗。");
        resolve(null);
      };
    });
  };

  // --- 事件處理 ---
  const handleMainImageUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setIsUploading(true);
      const img = await compressImage(file, 800);
      if (img) setNewItem((prev) => ({ ...prev, image: img }));
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleAdditionalImagesUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    if ((newItem.additionalImages?.length || 0) + files.length > 3) {
      showToast("最多只能額外上傳 3 張喔！");
      e.target.value = "";
      return;
    }
    setIsUploading(true);
    const compressedImages = await Promise.all(
      files.map((file) => compressImage(file, 600))
    );
    const validImages = compressedImages.filter((img) => img !== null);
    setNewItem((prev) => ({
      ...prev,
      additionalImages: [...(prev.additionalImages || []), ...validImages],
    }));
    setIsUploading(false);
    e.target.value = "";
  };

  const removeAdditionalImage = (idx) => {
    setNewItem((prev) => ({
      ...prev,
      additionalImages: prev.additionalImages.filter((_, i) => i !== idx),
    }));
  };

  const handleEdit = (e, item) => {
    e.stopPropagation();
    setNewItem({ ...item, additionalImages: item.additionalImages || [] });
    setEditingId(item.id);
    setIsUploading(false);
    setIsFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      alert("⚠️ 系統連線中，請稍等再試！(請確認是否在新視窗開啟)");
      return;
    }
    if (!newItem.image && !newItem.brand) {
      showToast("請上傳照片或輸入品牌！");
      return;
    }

    const targetUid = user.uid;
    const dataToSave = {
      ...newItem,
      brand: newItem.brand || "未分類",
      status: newItem.status || "未售出",
      updatedAt: Date.now(),
    };

    try {
      if (editingId) {
        await updateDoc(
          doc(
            db,
            "artifacts",
            appId,
            "public",
            "data",
            `wardrobe_${targetUid}`,
            editingId
          ),
          dataToSave
        );
        showToast("✅ 已儲存修改！");
      } else {
        await addDoc(
          collection(
            db,
            "artifacts",
            appId,
            "public",
            "data",
            `wardrobe_${targetUid}`
          ),
          { ...dataToSave, createdAt: Date.now() }
        );
        showToast("✅ 已加入圖庫！");
      }
      setNewItem(defaultFormState);
      setEditingId(null);
      setIsFormOpen(false);
    } catch (error) {
      showToast("儲存失敗，請重試。");
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    try {
      await deleteDoc(
        doc(
          db,
          "artifacts",
          appId,
          "public",
          "data",
          `wardrobe_${user.uid}`,
          id
        )
      );
      showToast("🗑️ 已刪除。");
    } catch (error) {
      showToast("刪除失敗。");
    }
  };

  const handleShare = () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?view=${user.uid}`;
    const el = document.createElement("textarea");
    el.value = shareUrl;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    showToast("🔗 圖庫連結已複製！");
  };

  return (
    <div
      className={`min-h-screen bg-stone-50 text-stone-800 font-sans p-4 md:p-8 relative ${
        selectedItem ? "overflow-hidden h-screen" : ""
      }`}
    >
      {toastMsg && (
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 bg-stone-800 text-white px-5 py-3 rounded-full shadow-lg z-50 flex items-center gap-2 animate-fade-in text-sm font-medium">
          {toastMsg.includes("✅") ? (
            <CheckCircle size={18} className="text-green-400" />
          ) : (
            <Info size={18} />
          )}
          {toastMsg.replace("✅ ", "").replace("🗑️ ", "").replace("🔗 ", "")}
        </div>
      )}

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 bg-stone-900/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col md:flex-row relative">
            <button
              onClick={() => setSelectedItem(null)}
              className="absolute top-4 right-4 z-10 bg-black/20 text-white hover:bg-black/40 p-2 rounded-full backdrop-blur md:text-stone-400 md:bg-stone-100 md:hover:bg-stone-200"
            >
              <X size={24} />
            </button>
            <div className="w-full md:w-3/5 bg-stone-100 overflow-y-auto max-h-[50vh] md:max-h-full scrollbar-hide">
              {selectedItem.image && (
                <img
                  src={selectedItem.image}
                  alt="主照片"
                  className="w-full h-auto object-cover"
                />
              )}
              {selectedItem.additionalImages?.length > 0 && (
                <div className="p-4 bg-stone-100">
                  <h4 className="text-sm font-bold text-stone-500 mb-3 flex items-center gap-1">
                    <ImageIcon size={16} /> 實穿照片 (
                    {selectedItem.additionalImages.length})
                  </h4>
                  <div className="flex flex-col gap-4">
                    {selectedItem.additionalImages.map((img, idx) => (
                      <img
                        key={idx}
                        src={img}
                        alt="實穿"
                        className="w-full rounded-xl shadow-sm object-cover"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="w-full md:w-2/5 p-6 md:p-8 flex flex-col bg-white overflow-y-auto max-h-[40vh] md:max-h-full">
              <div className="flex flex-wrap gap-2 mb-4">
                {selectedItem.season && (
                  <span className="bg-stone-100 text-stone-600 text-xs px-3 py-1.5 rounded-full font-medium border">
                    {selectedItem.season}
                  </span>
                )}
                {selectedItem.status && (
                  <span
                    className={`text-xs px-3 py-1.5 rounded-full font-medium border ${
                      selectedItem.status === "售出"
                        ? "bg-stone-500 text-white"
                        : selectedItem.status === "待售"
                        ? "bg-[#d4c4b7] text-stone-800"
                        : selectedItem.status === "囤貨"
                        ? "bg-stone-200 text-stone-700"
                        : "bg-white text-stone-600"
                    }`}
                  >
                    {selectedItem.status}
                  </span>
                )}
              </div>
              <h2 className="text-2xl font-bold text-stone-800 mb-2">
                {selectedItem.brand}
              </h2>
              {selectedItem.size && (
                <div className="inline-block bg-stone-800 text-white text-sm px-4 py-2 rounded-lg font-bold mb-6 self-start shadow-sm">
                  <span className="text-stone-300 text-xs font-medium mr-1">
                    尺寸
                  </span>
                  {selectedItem.size}
                </div>
              )}
              <div className="mt-4 flex-grow">
                <h4 className="text-sm font-bold text-stone-500 mb-2 border-b pb-2 flex items-center gap-2">
                  <AlignLeft size={16} /> 穿搭筆記
                </h4>
                <p className="text-stone-600 leading-relaxed whitespace-pre-line text-[15px]">
                  {selectedItem.notes || (
                    <span className="text-stone-400 italic text-sm">
                      沒有留下筆記喔～
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto">
        {isReadOnly && (
          <div className="bg-[#d4c4b7]/30 text-stone-700 p-3 rounded-xl mb-6 flex items-center justify-center gap-2 text-sm font-medium border">
            <Info size={18} /> 訪客瀏覽模式，無法編輯圖庫。
          </div>
        )}

        <header className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
          <div className="text-center sm:text-left">
            {isEditingHeader && !isReadOnly ? (
              <div className="flex flex-col gap-2 bg-white p-4 rounded-xl shadow-sm border text-left">
                <input
                  type="text"
                  value={editHeaderInfo.title}
                  onChange={(e) =>
                    setEditHeaderInfo({
                      ...editHeaderInfo,
                      title: e.target.value,
                    })
                  }
                  className="text-2xl font-bold text-stone-700 border-b-2 border-[#d4c4b7] focus:outline-none bg-transparent px-1 py-1"
                />
                <input
                  type="text"
                  value={editHeaderInfo.subtitle}
                  onChange={(e) =>
                    setEditHeaderInfo({
                      ...editHeaderInfo,
                      subtitle: e.target.value,
                    })
                  }
                  className="text-sm text-stone-600 border-b focus:outline-none bg-transparent px-1 py-1"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleSaveHeader}
                    className="text-xs bg-[#d4c4b7] px-4 py-1.5 rounded-full font-medium"
                  >
                    儲存
                  </button>
                  <button
                    onClick={() => setIsEditingHeader(false)}
                    className="text-xs bg-stone-200 px-4 py-1.5 rounded-full font-medium"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="group relative inline-block pr-8">
                <h1 className="text-2xl font-bold text-stone-700">
                  {headerInfo.title}
                </h1>
                <p className="text-sm text-stone-500 mt-1">
                  {headerInfo.subtitle}
                </p>
                {!isReadOnly && (
                  <button
                    onClick={() => {
                      setEditHeaderInfo(headerInfo);
                      setIsEditingHeader(true);
                    }}
                    className="absolute right-0 top-1/2 -translate-y-1/2 p-2 opacity-0 group-hover:opacity-100 hover:bg-stone-200 rounded-full"
                  >
                    <Edit2 size={16} />
                  </button>
                )}
              </div>
            )}
          </div>

          {!isReadOnly && (
            <div className="flex gap-3">
              <button
                onClick={handleShare}
                className="flex items-center gap-2 bg-white border px-4 py-2.5 rounded-full text-sm font-medium"
              >
                <Share2 size={16} /> 分享圖庫
              </button>
              <button
                onClick={() => {
                  setNewItem(defaultFormState);
                  setEditingId(null);
                  setIsFormOpen(!isFormOpen);
                }}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium ${
                  isFormOpen
                    ? "bg-stone-200 text-stone-700"
                    : "bg-stone-700 text-white"
                }`}
              >
                {isFormOpen ? (
                  "取消"
                ) : (
                  <>
                    <Plus size={18} /> 新增衣物
                  </>
                )}
              </button>
            </div>
          )}
        </header>

        {isFormOpen && !isReadOnly && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border mb-8 animate-fade-in">
            <form
              onSubmit={handleSubmit}
              className="grid grid-cols-1 lg:grid-cols-2 gap-8"
            >
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-stone-600 flex items-center gap-1">
                    <Camera size={16} /> 單品主圖
                  </label>
                  <div className="border-2 border-dashed rounded-xl h-48 flex items-center justify-center relative bg-stone-50 cursor-pointer group overflow-hidden">
                    {isUploading ? (
                      <div className="text-stone-400 text-sm">
                        圖片處理中...
                      </div>
                    ) : newItem.image ? (
                      <>
                        <img
                          src={newItem.image}
                          className="w-full h-full object-cover group-hover:opacity-75"
                          alt="預覽"
                        />
                        <div className="absolute opacity-0 group-hover:opacity-100 bg-stone-800/70 text-white px-3 py-1.5 rounded-full text-sm">
                          更換主圖
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-stone-400">
                        <ImageIcon size={32} />
                        <span className="text-sm">點擊上傳</span>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleMainImageUpload}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      disabled={isUploading}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2 p-4 bg-stone-50 rounded-xl border">
                  <div className="flex justify-between">
                    <label className="text-sm font-medium flex items-center gap-1">
                      <ImageIcon size={16} /> 實穿照 (最多3張)
                    </label>
                    <span className="text-xs text-stone-400">
                      {newItem.additionalImages?.length || 0}/3
                    </span>
                  </div>
                  {newItem.additionalImages?.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {newItem.additionalImages.map((img, idx) => (
                        <div
                          key={idx}
                          className="relative w-20 h-20 flex-shrink-0"
                        >
                          <img
                            src={img}
                            alt="實穿"
                            className="w-full h-full object-cover rounded-lg border"
                          />
                          <button
                            type="button"
                            onClick={() => removeAdditionalImage(idx)}
                            className="absolute top-1 right-1 bg-white/80 text-red-500 rounded-full p-0.5"
                          >
                            <XCircle size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {(newItem.additionalImages?.length || 0) < 3 && (
                    <div className="relative">
                      <button
                        type="button"
                        className="w-full py-2 border-2 border-dashed rounded-lg text-sm text-stone-500 flex justify-center items-center gap-1"
                      >
                        <Plus size={16} /> 加入實穿照
                      </button>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleAdditionalImagesUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        disabled={isUploading}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium flex items-center gap-1">
                      <Tag size={16} /> 品牌
                    </label>
                    <input
                      type="text"
                      value={newItem.brand}
                      onChange={(e) =>
                        setNewItem({ ...newItem, brand: e.target.value })
                      }
                      className="border rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 bg-stone-50"
                      placeholder="例: Laura Kae"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium flex items-center gap-1">
                      <Ruler size={16} /> 尺寸
                    </label>
                    <input
                      type="text"
                      value={newItem.size}
                      onChange={(e) =>
                        setNewItem({ ...newItem, size: e.target.value })
                      }
                      className="border rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 bg-stone-50"
                      placeholder="例: 100cm"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">季節</label>
                  <div className="flex gap-2">
                    {["春夏", "秋冬", "四季"].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setNewItem({ ...newItem, season: s })}
                        className={`flex-1 py-2 rounded-lg text-sm border ${
                          newItem.season === s
                            ? "bg-stone-700 text-white"
                            : "bg-stone-50"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">狀態</label>
                  <div className="flex gap-2">
                    {["未售出", "囤貨", "待售", "售出"].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setNewItem({ ...newItem, status: s })}
                        className={`flex-1 py-2 rounded-lg text-sm border ${
                          newItem.status === s
                            ? "bg-[#d4c4b7] text-stone-800 font-medium"
                            : "bg-stone-50"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 h-full">
                  <label className="text-sm font-medium flex items-center gap-1">
                    <AlignLeft size={16} /> 筆記
                  </label>
                  <textarea
                    value={newItem.notes}
                    onChange={(e) =>
                      setNewItem({ ...newItem, notes: e.target.value })
                    }
                    className="border rounded-lg px-3 py-2.5 h-full min-h-[80px] resize-none focus:outline-none focus:ring-2 bg-stone-50"
                  />
                </div>
              </div>
              <div className="lg:col-span-2 flex justify-end mt-2 pt-4 border-t">
                <button
                  type="submit"
                  disabled={isUploading}
                  className={`bg-[#d4c4b7] text-stone-800 font-medium px-8 py-2.5 rounded-full ${
                    isUploading ? "opacity-50" : ""
                  }`}
                >
                  {editingId ? "儲存修改" : "儲存到圖庫"}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="flex flex-col gap-3 mb-6 bg-white p-4 rounded-2xl shadow-sm border">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-stone-500 w-12 text-right">
              品牌
            </span>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide flex-grow pb-1">
              {brands.map((b) => (
                <button
                  key={b}
                  onClick={() => setFilterBrand(b)}
                  className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm border ${
                    filterBrand === b
                      ? "bg-stone-700 text-white"
                      : "bg-stone-50"
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2 border-t">
            <span className="text-sm font-bold text-stone-500 w-12 text-right">
              狀態
            </span>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide flex-grow pb-1">
              {["全部", "未售出", "囤貨", "待售", "售出"].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm border ${
                    filterStatus === s
                      ? "bg-[#d4c4b7] font-medium"
                      : "bg-stone-50"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="py-20 text-center text-stone-400 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-[#d4c4b7] border-t-transparent rounded-full animate-spin"></div>
            載入圖庫中...
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredClothes.length === 0 ? (
              <div className="col-span-full py-16 text-center text-stone-400 bg-white rounded-2xl border border-dashed">
                這個圖庫目前還沒有衣服喔！
              </div>
            ) : (
              filteredClothes.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className="bg-white rounded-2xl overflow-hidden shadow-sm border hover:shadow-md hover:-translate-y-1 transition-all group flex flex-col cursor-pointer"
                >
                  <div className="aspect-[4/5] relative bg-stone-100">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt="衣服"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-stone-300">
                        <ImageIcon size={48} />
                      </div>
                    )}
                    <div className="absolute top-3 left-3 flex flex-col gap-2 items-start z-10">
                      {item.season && (
                        <span className="bg-white/90 backdrop-blur-sm text-xs px-2.5 py-1 rounded-full font-medium">
                          {item.season}
                        </span>
                      )}
                      {item.status && (
                        <span
                          className={`backdrop-blur-sm text-xs px-2.5 py-1 rounded-full font-medium border ${
                            item.status === "售出"
                              ? "bg-stone-500/90 text-white"
                              : item.status === "待售"
                              ? "bg-[#d4c4b7]/90 text-stone-800"
                              : item.status === "囤貨"
                              ? "bg-stone-200/90 text-stone-700"
                              : "bg-white/90 text-stone-600"
                          }`}
                        >
                          {item.status}
                        </span>
                      )}
                    </div>
                    {item.additionalImages?.length > 0 && (
                      <div className="absolute top-3 right-3 bg-stone-800/80 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-full flex items-center gap-1 z-10">
                        <ImageIcon size={12} /> +{item.additionalImages.length}{" "}
                        實穿
                      </div>
                    )}
                    {item.size && (
                      <div className="absolute bottom-3 right-3 bg-stone-900/85 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-sm font-bold shadow-lg z-10 border border-stone-700/50">
                        <span className="text-stone-300 text-xs font-medium mr-1">
                          尺寸
                        </span>
                        {item.size}
                      </div>
                    )}
                    {!isReadOnly && (
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 z-20">
                        <button
                          onClick={(e) => handleEdit(e, item)}
                          className="bg-white text-stone-800 p-3 rounded-full hover:scale-110 shadow-lg flex items-center gap-2 text-sm font-bold"
                        >
                          <Edit2 size={18} /> 編輯
                        </button>
                        <button
                          onClick={(e) => {
                            if (window.confirm("確定刪除？"))
                              handleDelete(e, item.id);
                          }}
                          className="bg-red-500 text-white p-3 rounded-full hover:scale-110 shadow-lg"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="p-5 flex-grow flex flex-col">
                    <h3 className="font-bold text-stone-800 text-lg mb-3">
                      {item.brand}
                    </h3>
                    {item.notes && (
                      <p className="text-sm text-stone-500 bg-stone-50 p-3 rounded-lg border mt-auto line-clamp-3">
                        {item.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
