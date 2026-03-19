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
            <div className="w-full md:w
