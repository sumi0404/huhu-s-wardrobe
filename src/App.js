import React, { useState, useEffect, useMemo } from "react";
import {
  Camera,
  Plus,
  AlignLeft,
  Trash2,
  Edit2,
  Share2,
  Image as ImageIcon,
  CheckCircle,
  Info,
  X,
  XCircle,
  Tag,
  Archive,
  Lock
} from "lucide-react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  limit
} from "firebase/firestore";
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";

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
const db = getFirestore(app);
const storage = getStorage(app);

export default function App() {
  const [clothes, setClothes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // --- 權限與安全狀態 ---
  const [isReadOnly] = useState(() =>
    new URLSearchParams(window.location.search).get("view") === "shared"
  );
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [inputPassword, setInputPassword] = useState("");

  const [filterBrand, setFilterBrand] = useState("全部");
  const [filterStatus, setFilterStatus] = useState("全部");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const headerInfo = {
    title: "Huhu的衣櫃",
    subtitle: "紀錄日常的每一件經典",
  };

  const [selectedItem, setSelectedItem] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);

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

  useEffect(() => {
    const clothesRef = collection(db, "clothes");
    const q = query(clothesRef, orderBy("createdAt", "desc"), limit(150));

    const unsubscribeClothes = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setClothes(data);
        setIsLoading(false);
      },
      (error) => {
        console.error("讀取資料失敗:", error);
        // Fallback for missing indexes
        const fallbackUnsub = onSnapshot(clothesRef, (snap) => {
          const data = snap.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => b.createdAt - a.createdAt);
          setClothes(data);
          setIsLoading(false);
        });
        return () => fallbackUnsub();
      }
    );

    return () => {
      unsubscribeClothes();
    };
  }, []);

  const brandData = useMemo(() => {
    const counts = { '全部': clothes.length };
    const uniqueBrands = new Set();
    clothes.forEach(c => {
      const b = (c.brand && c.brand.trim() !== "") ? c.brand.trim() : '無品牌';
      uniqueBrands.add(b);
      counts[b] = (counts[b] || 0) + 1;
    });
    return {
      list: ["全部", ...Array.from(uniqueBrands).sort()],
      counts
    };
  }, [clothes]);

  const statusData = useMemo(() => {
    const counts = { '全部': clothes.length, '未售出': 0, '囤貨': 0, '待售': 0, '售出': 0 };
    clothes.forEach(c => {
      const s = c.status || '未售出';
      if (counts[s] !== undefined) {
        counts[s]++;
      } else {
        counts[s] = 1;
      }
    });
    return {
      list: ["全部", "未售出", "囤貨", "待售", "售出"],
      counts
    };
  }, [clothes]);

  const filteredClothes = useMemo(() => {
    return clothes.filter((c) => {
      const b = (c.brand && c.brand.trim() !== "") ? c.brand.trim() : '無品牌';
      return (
        (filterBrand === "全部" || b === filterBrand) &&
        (filterStatus === "全部" || c.status === filterStatus)
      );
    });
  }, [clothes, filterBrand, filterStatus]);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 4000);
  };

  // --- 管理員密碼驗證 ---
  const handleLogin = (e) => {
    e.preventDefault();
    if (inputPassword === "0602") {
      setIsAuthenticated(true);
      showToast("歡迎回來，管理員解鎖成功");
    } else {
      showToast("密碼錯誤，請重新輸入");
      setInputPassword("");
    }
  };

  const compressImage = (file, maxSize = 800) => {
    return new Promise((resolve) => {
      if (!file.type.startsWith("image/")) {
        showToast("請上傳正確的相片格式");
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
          let width = img.width, height = img.height;
          if (width > height && width > maxSize) {
            height *= maxSize / width;
            width = maxSize;
          } else if (height > maxSize) {
            width *= maxSize / height;
            height = maxSize;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.8));
        };
        img.onerror = () => resolve(null);
      };
      reader.onerror = () => resolve(null);
    });
  };

  const handleMainImageUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const img = await compressImage(file, 800);
      if (img) setNewItem((prev) => ({ ...prev, image: img }));
      e.target.value = "";
    }
  };

  const handleAdditionalImagesUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    if ((newItem.additionalImages?.length || 0) + files.length > 3) {
      showToast("實穿相片至多 3 張");
      e.target.value = "";
      return;
    }
    const compressedImages = await Promise.all(
      files.map((file) => compressImage(file, 600))
    );
    const validImages = compressedImages.filter((img) => img !== null);
    setNewItem((prev) => ({
      ...prev,
      additionalImages: [...(prev.additionalImages || []), ...validImages],
    }));
    e.target.value = "";
  };

  const removeAdditionalImage = (idx) => {
    setNewItem((prev) => ({
      ...prev,
      additionalImages: prev.additionalImages.filter((_, i) => i !== idx),
    }));
  };

  const handleEdit = (item) => {
    setNewItem({ ...item, additionalImages: item.additionalImages || [] });
    setEditingId(item.id);
    setIsFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const uploadImageToStorage = async (base64Str, path) => {
    if (!base64Str || !base64Str.startsWith("data:image")) return base64Str;
    const storageRef = ref(storage, path);
    await uploadString(storageRef, base64Str, 'data_url');
    const downloadURL = await getDownloadURL(storageRef);
    return downloadURL;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newItem.image && !newItem.brand) {
      showToast("請上傳相片或輸入品牌名稱");
      return;
    }

    setIsUploading(true);
    showToast("圖片上傳雲端中，請稍候...");

    try {
      let mainImageUrl = newItem.image;
      if (mainImageUrl && mainImageUrl.startsWith("data:image")) {
        const timestamp = Date.now();
        mainImageUrl = await uploadImageToStorage(mainImageUrl, `clothes/${timestamp}_main.jpg`);
      }

      let addImageUrls = [];
      if (newItem.additionalImages && newItem.additionalImages.length > 0) {
        for (let i = 0; i < newItem.additionalImages.length; i++) {
          let imgStr = newItem.additionalImages[i];
          if (imgStr && imgStr.startsWith("data:image")) {
             imgStr = await uploadImageToStorage(imgStr, `clothes/${Date.now()}_add_${i}.jpg`);
          }
          addImageUrls.push(imgStr);
        }
      }

      const dataToSave = {
        ...newItem,
        image: mainImageUrl,
        additionalImages: addImageUrls,
        brand: newItem.brand || "無品牌",
        status: newItem.status || "未售出",
        updatedAt: Date.now(),
      };

      if (editingId) {
        await updateDoc(doc(db, "clothes", editingId), dataToSave);
        showToast("已更新典藏紀錄");
      } else {
        await addDoc(collection(db, "clothes"), {
          ...dataToSave,
          createdAt: Date.now(),
        });
        showToast("已成功收錄至衣櫥！重新整理也不會消失了。");
      }
      
      setNewItem(defaultFormState);
      setEditingId(null);
      setIsFormOpen(false);
    } catch (error) {
      console.error("Firestore Error:", error);
      showToast(`儲存失敗：請確認 Firebase 的安全性規則已開啟`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, "clothes", id));
      showToast("已移除紀錄");
    } catch (error) {
      console.error("Delete Error:", error);
      showToast("移除失敗，請檢查資料庫權限");
    }
  };

  const handleShare = () => {
    const baseUrl = window.location.href.split('?')[0];
    const shareUrl = `${baseUrl}?view=shared`;
    
    const el = document.createElement("textarea");
    el.value = shareUrl;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    showToast("鑑賞連結已複製！現在朋友點開都能看到圖片了");
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "售出": return "text-[#76848F] border-[#D0D9DF] bg-[#F0F4F5]"; 
      case "待售": return "text-[#A88265] border-[#E8D4C8] bg-[#FDF8F5]"; 
      case "囤貨": return "text-[#8CA1A5] border-[#DCE4E8] bg-[#F5F8F9]"; 
      default: return "text-[#AF7C83] border-[#F0D5D8] bg-[#FDF7F8]"; 
    }
  };

  const getSeasonColor = (season) => {
    switch (season) {
      case "春夏": return "text-[#8F9CAE] border-[#DDE3ED] bg-[#F5F7FA]"; 
      case "秋冬": return "text-[#9E8B7A] border-[#E6DDD5] bg-[#FCFAF8]"; 
      default: return "text-[#96938D] border-[#E0DED9] bg-[#F9F8F6]"; 
    }
  };

  // --- 大理石灰白渲染與和風紋理底圖 ---
  const marbleWashiBg = {
    backgroundColor: "#FCFCFC",
    backgroundImage: `
      radial-gradient(circle at 15% 40%, rgba(240, 242, 245, 0.4), transparent 60%),
      radial-gradient(circle at 80% 20%, rgba(233, 236, 239, 0.5), transparent 60%),
      linear-gradient(rgba(252, 252, 252, 0.45), rgba(250, 250, 250, 0.65)),
      url("https://i.postimg.cc/mgVNsKJq/white-00036.jpg")
    `,
    backgroundSize: "100% 100%, 100% 100%, 100% 100%, cover",
    backgroundPosition: "center",
    backgroundAttachment: "fixed",
  };

  return (
    <div
      style={marbleWashiBg}
      // 優化外層 padding，讓手機版有更好的閱讀呼吸空間
      className={`min-h-screen text-[#4A4F55] font-serif p-3 md:p-10 relative selection:bg-[#E1E5E8] selection:text-[#4A4F55] ${
        selectedItem || (!isReadOnly && !isAuthenticated) ? "overflow-hidden h-screen" : ""
      }`}
    >
      {/* 浮動提示框 */}
      {toastMsg && (
        <div className="fixed top-8 left-1/2 transform -translate-x-1/2 bg-white/95 backdrop-blur-md text-[#4A4F55] border border-[#E1E5E8] px-8 py-3 shadow-[0_4px_15px_rgba(0,0,0,0.03)] z-50 flex items-center gap-3 animate-fade-in text-[13px] tracking-widest font-medium w-max max-w-[90vw]">
          {toastMsg.includes("已") || toastMsg.includes("收錄") || toastMsg.includes("複製") || toastMsg.includes("成功") ? (
            <CheckCircle size={16} className="text-[#A9B1B8]" strokeWidth={1.5} />
          ) : (
            <Info size={16} className="text-[#A9B1B8]" strokeWidth={1.5} />
          )}
          {toastMsg}
        </div>
      )}

      {/* --- 管理員登入畫面防護 (如果不是訪客模式，且尚未登入) --- */}
      {!isReadOnly && !isAuthenticated ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="bg-white/85 backdrop-blur-md p-8 md:p-14 border border-[#E1E5E8] max-w-[420px] w-full text-center shadow-[0_15px_50px_rgba(0,0,0,0.06)] animate-fade-in flex flex-col items-center">
            <div className="w-12 h-12 bg-[#F8F9FA] rounded-full flex items-center justify-center mb-6 border border-[#E1E5E8] text-[#A9B1B8]">
              <Lock size={20} strokeWidth={1.5} />
            </div>
            <h1 className="text-xl md:text-2xl text-[#4A4F55] tracking-[0.2em] font-bold mb-3">私人典藏空間</h1>
            <p className="text-[11px] text-[#838A91] tracking-[0.2em] mb-10 uppercase font-semibold">Huhu's Wardrobe</p>

            <form onSubmit={handleLogin} className="w-full flex flex-col gap-8">
              <input
                type="password"
                value={inputPassword}
                onChange={(e) => setInputPassword(e.target.value)}
                placeholder="請輸入管理密碼"
                className="w-full text-center py-2.5 focus:outline-none bg-transparent text-[#4A4F55] text-[16px] tracking-[0.3em] placeholder-[#B8C0C7] border-b border-[#E1E5E8] focus:border-[#9EA7B0] transition-colors font-sans"
              />
              <button
                type="submit"
                className="w-full bg-[#4A4F55] text-white text-[13px] font-bold tracking-[0.3em] py-4 hover:bg-[#3B3E42] transition-colors shadow-sm"
              >
                解鎖衣櫃
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-[#EBEDF0] w-full">
               <button 
                 onClick={() => window.location.href = '?view=shared'} 
                 className="text-[12px] text-[#A9B1B8] hover:text-[#838A91] tracking-[0.15em] border-b border-transparent hover:border-[#838A91] pb-0.5 transition-colors font-semibold"
               >
                 以訪客身分鑑賞
               </button>
            </div>
          </div>
        </div>
      ) : (
        /* --- 驗證通過後的正式內容 --- */
        <>
          {/* 客製化刪除確認視窗 */}
          {itemToDelete && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/10 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white/95 backdrop-blur-md p-8 border border-[#E1E5E8] max-w-sm w-full text-center shadow-[0_10px_40px_rgba(0,0,0,0.08)]">
                <h3 className="text-[16px] font-bold text-[#4A4F55] mb-3 tracking-widest">
                  確認移除
                </h3>
                <p className="text-[13px] text-[#838A91] mb-8 font-medium tracking-wide leading-relaxed">
                  確定要將「{itemToDelete.brand || '此紀錄'}」從衣櫥中移除嗎？<br />此操作無法復原。
                </p>
                <div className="flex gap-4 justify-center">
                  <button
                    onClick={() => {
                      handleDelete(itemToDelete.id);
                      setItemToDelete(null);
                    }}
                    className="text-[13px] font-bold text-white bg-[#AF7C83] px-8 py-2.5 hover:bg-[#9A6A70] transition-colors border border-transparent shadow-sm"
                  >
                    確定移除
                  </button>
                  <button
                    onClick={() => setItemToDelete(null)}
                    className="text-[13px] font-bold text-[#838A91] bg-transparent border border-[#E1E5E8] hover:text-[#4A4F55] hover:bg-[#F8F9FA] px-8 py-2.5 transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 圖片細節 Modal (優雅藝廊模式) */}
          {selectedItem && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-12 bg-[#F8F9FA]/90 backdrop-blur-md animate-fade-in">
              <button
                onClick={() => setSelectedItem(null)}
                className="absolute top-4 right-4 md:top-8 md:right-8 z-20 text-[#A9B1B8] hover:text-[#4A4F55] bg-white/50 hover:bg-white transition-colors p-2 shadow-sm border border-transparent hover:border-[#E1E5E8]"
              >
                <X size={28} strokeWidth={1.5} />
              </button>

              <div className="w-full h-full md:h-auto md:max-h-[85vh] max-w-[1000px] flex flex-col md:flex-row relative bg-white md:shadow-[0_15px_50px_rgba(0,0,0,0.06)] overflow-hidden border border-[#E1E5E8]">
                
                {/* 左側照片區 (手機版限制高度，避免撐滿全螢幕) */}
                <div className="w-full md:w-[55%] bg-[#F8F9FA] overflow-y-auto max-h-[50vh] md:max-h-full scrollbar-hide flex flex-col justify-start md:justify-center border-b md:border-b-0 md:border-r border-[#E1E5E8]">
                  {selectedItem.image && (
                    <div className="p-6 md:p-12 relative flex justify-center w-full">
                      <img
                        src={selectedItem.image}
                        alt="Main"
                        onError={(e) => {
                          e.target.onerror = null; 
                          e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 24 24' fill='none' stroke='%23B8C0C7' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2'/%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'/%3E%3Cpolyline points='21 15 16 10 5 21'/%3E%3C/svg%3E";
                        }}
                        // 響應式優化：手機版 max-h-[40vh] 防止過大，電腦版 max-h-[75vh]
                        className="max-h-[40vh] md:max-h-[75vh] w-auto mx-auto object-contain shadow-sm"
                      />
                      {/* 大尺寸浮水顯示 */}
                      {selectedItem.size && (
                        <div className="absolute bottom-4 left-4 md:bottom-8 md:left-8 bg-white/90 backdrop-blur-md text-[#4A4F55] px-3 py-1.5 md:px-4 md:py-2 shadow-sm border border-[#E1E5E8] text-[12px] md:text-[13px] tracking-widest font-bold">
                          尺寸：{selectedItem.size}
                        </div>
                      )}
                    </div>
                  )}
                  {selectedItem.additionalImages?.length > 0 && (
                    <div className="px-6 md:px-12 pb-12 flex flex-col gap-8">
                      {selectedItem.additionalImages.map((img, idx) => (
                        <img
                          key={idx}
                          src={img}
                          alt="Detail"
                          onError={(e) => { e.target.style.display = 'none'; }}
                          className="max-h-[40vh] md:max-h-[75vh] w-auto mx-auto object-contain shadow-sm border border-[#E1E5E8]"
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* 右側資訊區 */}
                <div className="w-full md:w-[45%] p-6 md:p-12 flex flex-col bg-white overflow-y-auto max-h-[50vh] md:max-h-full">
                  <div className="flex flex-wrap gap-2.5 mb-5 md:mb-6">
                    {selectedItem.season && (
                      <span className={`text-[11px] md:text-[12px] tracking-[0.2em] font-semibold px-2.5 py-1 border ${getSeasonColor(selectedItem.season)}`}>
                        {selectedItem.season}
                      </span>
                    )}
                    {selectedItem.status && (
                      <span className={`text-[11px] md:text-[12px] tracking-[0.2em] font-semibold px-2.5 py-1 border ${getStatusColor(selectedItem.status)}`}>
                        {selectedItem.status}
                      </span>
                    )}
                  </div>
                  
                  <h2 className="text-xl md:text-3xl text-[#4A4F55] mb-5 md:mb-6 tracking-widest leading-relaxed font-bold">
                    {selectedItem.brand}
                  </h2>
                  
                  {selectedItem.size && (
                    <div className="text-[13px] md:text-[14px] text-[#838A91] tracking-[0.25em] mb-8 md:mb-10 flex items-center gap-2 md:gap-3 font-semibold">
                      <span className="text-[#B8C0C7]">尺寸標示 —</span> {selectedItem.size}
                    </div>
                  )}
                  
                  <div className="mt-2 flex-grow border-t border-[#EBEDF0] pt-6 md:pt-8">
                    <p className="text-[#838A91] leading-loose whitespace-pre-line text-[13px] md:text-[14px] tracking-widest font-medium">
                      {selectedItem.notes || (
                        <span className="text-[#B8C0C7] italic">尚無相關紀錄</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 主內容區 */}
          <div className="max-w-[1200px] mx-auto pt-2 md:pt-10 relative z-10">
            
            {/* Header 區塊 */}
            <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 md:mb-10 pb-5 md:pb-6 border-b border-[#E1E5E8] gap-4 md:gap-6">
              <div className="w-full md:max-w-2xl text-left">
                {isReadOnly && (
                  <div className="text-[#A9B1B8] text-[11px] md:text-[12px] tracking-[0.2em] mb-3 md:mb-4 flex items-center gap-2 bg-white/50 backdrop-blur-sm w-fit px-3 py-1.5 md:px-4 border border-[#E1E5E8]">
                    <Info size={14} />
                    <span>訪客鑑賞模式</span>
                  </div>
                )}
                
                <div className="group relative inline-block text-left w-full mt-2 md:mt-0">
                  <h1 className="text-2xl md:text-3xl text-[#4A4F55] tracking-[0.2em] leading-tight font-bold">
                    {headerInfo.title}
                  </h1>
                  <p className="text-[11px] md:text-[12px] text-[#A9B1B8] mt-2 md:mt-3 tracking-[0.25em] font-semibold uppercase">
                    {headerInfo.subtitle}
                  </p>
                </div>
              </div>

              {!isReadOnly && (
                <div className="flex gap-4 md:gap-6 mt-2 md:mt-0 shrink-0 w-full md:w-auto">
                  <button
                    onClick={handleShare}
                    className="flex-1 md:flex-none justify-center items-center flex gap-2 text-[12px] tracking-[0.2em] font-bold text-[#838A91] hover:text-[#4A4F55] transition-colors pb-1 border-b border-transparent hover:border-[#4A4F55]"
                  >
                    <Share2 size={14} strokeWidth={1.5} /> 分享
                  </button>
                  <button
                    onClick={() => {
                      setNewItem(defaultFormState);
                      setEditingId(null);
                      setIsFormOpen(!isFormOpen);
                    }}
                    className={`flex-1 md:flex-none justify-center flex items-center gap-2 text-[12px] tracking-[0.2em] font-bold transition-colors pb-1 border-b ${
                      isFormOpen
                        ? "text-[#4A4F55] border-[#4A4F55]"
                        : "text-[#838A91] hover:text-[#4A4F55] border-transparent hover:border-[#4A4F55]"
                    }`}
                  >
                    {isFormOpen ? (
                      <>關閉</>
                    ) : (
                      <>
                        <Plus size={14} strokeWidth={1.5} /> 新增
                      </>
                    )}
                  </button>
                </div>
              )}
            </header>

            {/* 新增/編輯表單 */}
            {isFormOpen && !isReadOnly && (
              <div className="bg-white/95 backdrop-blur-md p-6 md:p-10 shadow-sm border border-[#E1E5E8] mb-10 md:mb-12 animate-fade-in w-full">
                <h3 className="text-[14px] font-bold text-[#4A4F55] mb-6 md:mb-8 tracking-[0.2em] text-left border-b border-[#EBEDF0] pb-3 md:pb-4">
                  {editingId ? "編輯收錄資訊" : "新增典藏紀錄"}
                </h3>

                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                  {/* 左側：照片上傳 */}
                  <div className="flex flex-col gap-5 md:gap-6">
                    <div className="flex flex-col gap-2 md:gap-3">
                      <label className="text-[12px] md:text-[13px] font-bold tracking-widest text-[#838A91]">
                        主要相片
                      </label>
                      {/* 響應式優化：手機版高度縮小至 h-56，電腦版維持 h-72 */}
                      <div className="border border-[#E1E5E8] bg-[#F8F9FA] h-56 md:h-72 flex items-center justify-center relative cursor-pointer hover:bg-white transition-colors">
                        {isUploading ? (
                          <div className="text-[#A9B1B8] text-[12px] md:text-[13px] font-bold tracking-widest">
                            圖片上傳中...
                          </div>
                        ) : newItem.image ? (
                          <div className="w-full h-full p-2 md:p-3 flex justify-center">
                            <img
                              src={newItem.image}
                              className="max-h-full w-auto object-contain opacity-95 hover:opacity-100 transition-opacity border border-[#EBEDF0]"
                              alt="Preview"
                            />
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2 md:gap-3 text-[#B8C0C7]">
                            <Camera size={24} strokeWidth={1.2} className="md:w-7 md:h-7" />
                            <span className="text-[11px] md:text-[12px] font-bold tracking-widest">點擊上傳</span>
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

                    <div className="flex flex-col gap-2 md:gap-3">
                      <div className="flex justify-between items-center border-b border-[#E1E5E8] pb-1.5 md:pb-2">
                        <label className="text-[12px] md:text-[13px] font-bold tracking-widest text-[#838A91]">
                          實穿相片
                        </label>
                        <span className="text-[10px] md:text-[11px] font-bold text-[#A9B1B8]">
                          {newItem.additionalImages?.length || 0}/3
                        </span>
                      </div>
                      
                      {newItem.additionalImages?.length > 0 && (
                        <div className="flex gap-2.5 overflow-x-auto pt-2 pb-1">
                          {newItem.additionalImages.map((img, idx) => (
                            <div key={idx} className="relative w-16 h-16 md:w-20 md:h-20 flex-shrink-0 border border-[#E1E5E8] p-1 bg-white group">
                              <img
                                src={img}
                                alt="Additional"
                                className="w-full h-full object-cover"
                              />
                              <button
                                type="button"
                                onClick={() => removeAdditionalImage(idx)}
                                className="absolute -top-1.5 -right-1.5 md:-top-2 md:-right-2 bg-white text-[#A9B1B8] p-0.5 md:p-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity shadow-sm border border-[#E1E5E8] rounded-full"
                              >
                                <X size={10} strokeWidth={1.5} className="md:w-3 md:h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {(newItem.additionalImages?.length || 0) < 3 && (
                        <div className="relative mt-1">
                          <button
                            type="button"
                            className="w-full py-2.5 md:py-3 border border-dashed border-[#B8C0C7] text-[12px] md:text-[13px] font-bold tracking-widest text-[#A9B1B8] hover:text-[#4A4F55] hover:border-[#A9B1B8] transition-colors bg-[#F8F9FA]/50"
                            disabled={isUploading}
                          >
                            + 附加相片
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

                  {/* 右側：資料輸入 */}
                  <div className="flex flex-col gap-5 md:gap-6">
                    <div className="flex flex-col gap-1.5 border-b border-[#E1E5E8] pb-1.5 md:pb-2">
                      <label className="text-[12px] md:text-[13px] font-bold tracking-widest text-[#838A91]">
                        品牌
                      </label>
                      <input
                        type="text"
                        value={newItem.brand}
                        onChange={(e) => setNewItem({ ...newItem, brand: e.target.value })}
                        className="w-full py-1 focus:outline-none bg-transparent text-[#4A4F55] text-[14px] md:text-[15px] font-bold tracking-widest placeholder-[#B8C0C7]"
                        placeholder="例如：Misha & Puff"
                        disabled={isUploading}
                      />
                    </div>
                    
                    <div className="flex flex-col gap-1.5 border-b border-[#E1E5E8] pb-1.5 md:pb-2">
                      <label className="text-[12px] md:text-[13px] font-bold tracking-widest text-[#838A91]">
                        尺寸
                      </label>
                      <input
                        type="text"
                        value={newItem.size}
                        onChange={(e) => setNewItem({ ...newItem, size: e.target.value })}
                        className="w-full py-1 focus:outline-none bg-transparent text-[#4A4F55] text-[14px] md:text-[15px] font-bold tracking-widest placeholder-[#B8C0C7]"
                        placeholder="例如：2"
                        disabled={isUploading}
                      />
                    </div>

                    <div className="flex flex-col gap-2 md:gap-3">
                      <label className="text-[12px] md:text-[13px] font-bold tracking-widest text-[#838A91]">季節</label>
                      <div className="flex gap-4 md:gap-5">
                        {["春夏", "秋冬", "四季"].map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={isUploading}
                            onClick={() => setNewItem({ ...newItem, season: s })}
                            className={`pb-0.5 text-[13px] md:text-[14px] font-bold tracking-widest border-b-2 transition-all ${
                              newItem.season === s
                                ? "text-[#4A4F55] border-[#4A4F55]"
                                : "text-[#A9B1B8] border-transparent hover:text-[#838A91]"
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 md:gap-3">
                      <label className="text-[12px] md:text-[13px] font-bold tracking-widest text-[#838A91]">狀態</label>
                      <div className="flex flex-wrap gap-4 md:gap-5">
                        {["未售出", "囤貨", "待售", "售出"].map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={isUploading}
                            onClick={() => setNewItem({ ...newItem, status: s })}
                            className={`pb-0.5 text-[13px] md:text-[14px] font-bold tracking-widest border-b-2 transition-all ${
                              newItem.status === s
                                ? "text-[#4A4F55] border-[#4A4F55]"
                                : "text-[#A9B1B8] border-transparent hover:text-[#838A91]"
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 flex-grow border-t border-[#EBEDF0] pt-3 md:pt-4">
                      <label className="text-[12px] md:text-[13px] font-bold tracking-widest text-[#838A91]">
                        紀實
                      </label>
                      <textarea
                        value={newItem.notes}
                        onChange={(e) => setNewItem({ ...newItem, notes: e.target.value })}
                        className="w-full h-full min-h-[80px] md:min-h-[90px] resize-none focus:outline-none bg-transparent text-[#4A4F55] text-[13px] md:text-[14px] leading-relaxed placeholder-[#B8C0C7] tracking-wide font-medium"
                        placeholder="寫下這件衣服的紀錄..."
                        disabled={isUploading}
                      />
                    </div>
                  </div>

                  {/* 儲存按鈕 */}
                  <div className="md:col-span-2 flex justify-start mt-2 md:mt-4">
                    <button
                      type="submit"
                      disabled={isUploading}
                      className={`w-full md:w-auto bg-[#4A4F55] text-white text-[12px] md:text-[13px] font-bold tracking-[0.3em] px-16 py-3 md:py-3.5 hover:bg-[#3B3E42] transition-colors shadow-sm border border-transparent flex items-center justify-center min-w-[200px] ${
                        isUploading ? "opacity-70 cursor-not-allowed" : ""
                      }`}
                    >
                      {isUploading ? (
                        <span className="animate-pulse">上傳中...</span>
                      ) : editingId ? (
                        "儲存更新"
                      ) : (
                        "確認收錄"
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* 分類導覽區塊 */}
            <div className="flex flex-col gap-4 md:gap-6 mb-8 md:mb-10 border-b border-[#E1E5E8] pb-5 md:pb-6 w-full">
              {/* 品牌分類 */}
              <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-6">
                <span className="text-[13px] md:text-[14px] tracking-widest text-[#838A91] font-bold flex items-center gap-1.5 md:gap-2 min-w-[90px]">
                  <Tag size={14} className="text-[#B8C0C7] md:w-4 md:h-4"/> 品牌
                </span>
                <div className="flex gap-3 md:gap-4 overflow-x-auto scrollbar-hide pb-2 md:pb-0 w-full">
                  {brandData.list.map((b) => (
                    <button
                      key={b}
                      onClick={() => setFilterBrand(b)}
                      className={`whitespace-nowrap px-2.5 py-1 md:px-3 md:py-1.5 text-[13px] md:text-[14px] tracking-widest transition-all border-b-2 ${
                        filterBrand === b
                          ? "text-[#4A4F55] border-[#4A4F55] font-bold"
                          : "text-[#A9B1B8] border-transparent hover:text-[#4A4F55] font-medium"
                      }`}
                    >
                      {b} <span className={`ml-1 text-[11px] md:text-[12px] ${filterBrand === b ? "text-[#838A91]" : "text-[#B8C0C7]"}`}>({brandData.counts[b]})</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 狀態分類 */}
              <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-6">
                <span className="text-[13px] md:text-[14px] tracking-widest text-[#838A91] font-bold flex items-center gap-1.5 md:gap-2 min-w-[90px]">
                  <Archive size={14} className="text-[#B8C0C7] md:w-4 md:h-4"/> 狀態
                </span>
                <div className="flex gap-3 md:gap-4 overflow-x-auto scrollbar-hide pb-2 md:pb-0 w-full">
                  {statusData.list.map((s) => (
                    <button
                      key={s}
                      onClick={() => setFilterStatus(s)}
                      className={`whitespace-nowrap px-2.5 py-1 md:px-3 md:py-1.5 text-[13px] md:text-[14px] tracking-widest transition-all border-b-2 ${
                        filterStatus === s
                          ? "text-[#4A4F55] border-[#4A4F55] font-bold"
                          : "text-[#A9B1B8] border-transparent hover:text-[#4A4F55] font-medium"
                      }`}
                    >
                      {s} <span className={`ml-1 text-[11px] md:text-[12px] ${filterStatus === s ? "text-[#838A91]" : "text-[#B8C0C7]"}`}>({statusData.counts[s]})</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 列表區塊 (響應式：手機版調整為較小巧緊密的 2~3 排列，圖片比例 4:5) */}
            {isLoading ? (
              <div className="py-24 flex justify-center">
                <span className="text-[13px] md:text-[14px] font-bold tracking-[0.25em] text-[#A9B1B8] animate-pulse">典藏庫載入中...</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-3 gap-y-6 md:gap-x-6 md:gap-y-10">
                {filteredClothes.length === 0 ? (
                  <div className="col-span-full py-24 flex flex-col items-center justify-center text-center">
                    <div className="text-[#E1E5E8] mb-4 md:mb-5">
                      <ImageIcon size={40} strokeWidth={1} className="md:w-12 md:h-12" />
                    </div>
                    <div className="text-[#A9B1B8] text-[13px] md:text-[14px] font-bold tracking-[0.2em]">
                      目前尚無紀錄
                    </div>
                  </div>
                ) : (
                  filteredClothes.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className="group flex flex-col cursor-pointer bg-white p-2.5 md:p-3 shadow-sm border border-[#E1E5E8] hover:shadow-md transition-all duration-300"
                    >
                      {/* 照片框 (改為 4:5 服飾型錄最佳比例，在手機上更修長秀氣) */}
                      <div className="aspect-[4/5] bg-[#F8F9FA] overflow-hidden relative mb-2.5 md:mb-3 border border-[#EBEDF0]">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt="Gallery item"
                            onError={(e) => {
                              e.target.onerror = null; 
                              e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 24 24' fill='none' stroke='%23B8C0C7' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2'/%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'/%3E%3Cpolyline points='21 15 16 10 5 21'/%3E%3C/svg%3E";
                            }}
                            className="w-full h-full object-cover opacity-[0.98] group-hover:opacity-100 group-hover:scale-[1.03] transition-transform duration-700 ease-out"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-[#B8C0C7]">
                            <ImageIcon size={24} strokeWidth={1} className="md:w-7 md:h-7" />
                          </div>
                        )}

                        {/* 左下角：精緻的浮水印尺寸標籤 */}
                        {item.size && (
                          <div className="absolute bottom-1.5 left-1.5 md:bottom-2 md:left-2 bg-white/90 backdrop-blur-sm text-[#4A4F55] border border-white/80 text-[10px] md:text-[11px] tracking-widest px-2 py-0.5 md:px-2.5 md:py-1 shadow-sm z-10 font-bold">
                            尺寸 {item.size}
                          </div>
                        )}

                        {/* 右上角：狀態與季節標籤 */}
                        <div className="absolute top-1.5 right-1.5 md:top-2 md:right-2 flex gap-1 items-start z-10 flex-col">
                          {item.season && (
                            <span className={`shadow-sm text-[8px] md:text-[9px] tracking-[0.15em] font-semibold px-1.5 py-0.5 md:px-2 border ${getSeasonColor(item.season)}`}>
                              {item.season}
                            </span>
                          )}
                          {item.status && (
                            <span className={`shadow-sm text-[8px] md:text-[9px] tracking-[0.15em] font-semibold px-1.5 py-0.5 md:px-2 border ${getStatusColor(item.status)}`}>
                              {item.status}
                            </span>
                          )}
                        </div>

                        {/* 管理員操作 (僅在解鎖狀態下顯示) */}
                        {!isReadOnly && isAuthenticated && (
                          <div className="absolute bottom-1.5 right-1.5 md:bottom-2 md:right-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 flex gap-1.5 z-20">
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleEdit(item);
                              }}
                              className="bg-white/95 text-[#A9B1B8] p-1.5 md:p-2 hover:text-[#4A4F55] transition-colors shadow-sm border border-[#E1E5E8]"
                            >
                              <Edit2 size={12} strokeWidth={1.5} className="md:w-3.5 md:h-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setItemToDelete(item);
                              }}
                              className="bg-white/95 text-[#A9B1B8] p-1.5 md:p-2 hover:text-[#AF7C83] transition-colors shadow-sm border border-[#E1E5E8]"
                            >
                              <Trash2 size={12} strokeWidth={1.5} className="md:w-3.5 md:h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                      
                      {/* 卡片文字區 */}
                      <div className="flex flex-col items-center text-center px-0.5 md:px-1 pb-0.5 md:pb-1">
                        <h3 className="text-[#4A4F55] text-[13px] md:text-[15px] tracking-[0.15em] truncate w-full font-bold">
                          {item.brand}
                        </h3>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
