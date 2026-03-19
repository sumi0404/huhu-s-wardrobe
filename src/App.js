import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Plus, Trash2, Image, Share2, Heart, Camera, Loader2 } from 'lucide-react';

// --- 請在此處替換成你自己的 Firebase 配置 ---
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
// ------------------------------------------

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

function App() {
  const [clothes, setClothes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState(false); // 訪客模式判斷

  useEffect(() => {
    // 檢查網址是否有分享參數
    const params = new URLSearchParams(window.location.search);
    if (params.get('view')) setViewMode(true);

    const q = query(collection(db, 'clothes'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClothes(items);
    });
    return () => unsubscribe();
  }, []);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    try {
      const storageRef = ref(storage, `clothes/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      await addDoc(collection(db, 'clothes'), {
        imageUrl: url,
        createdAt: new Date(),
        likes: 0
      });
    } catch (error) {
      alert("上傳失敗，請檢查 Firebase 設定！");
    }
    setLoading(false);
  };

  const deleteItem = async (id) => {
    if (window.confirm("確定要刪除這件衣服嗎？")) {
      await deleteDoc(doc(db, 'clothes', id));
    }
  };

  const shareGallery = () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?view=shared`;
    navigator.clipboard.writeText(shareUrl);
    alert("圖庫分享連結已複製！發送給親友，他們不用登入也能看喔！");
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 頂部導覽列 */}
      <nav className="bg-white shadow-sm sticky top-0 z-10 px-4 py-3 flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <Camera className="text-pink-500" />
          寶貝的雲端衣櫥
        </h1>
        {!viewMode && (
          <button 
            onClick={shareGallery}
            className="flex items-center gap-1 bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full text-sm font-medium hover:bg-blue-100 transition"
          >
            <Share2 size={16} /> 分享圖庫
          </button>
        )}
      </nav>

      {/* 訪客模式提示 */}
      {viewMode && (
        <div className="bg-amber-50 text-amber-700 px-4 py-2 text-center text-sm border-b border-amber-100">
          ✨ 您正在瀏覽分享圖庫 (訪客模式)
        </div>
      )}

      {/* 主要內容區 */}
      <main className="max-w-4xl mx-auto p-4">
        {clothes.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Image size={48} className="mx-auto mb-4 opacity-20" />
            <p>目前衣櫥裡還沒有衣服喔！</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {clothes.map((item) => (
              <div key={item.id} className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 group relative">
                <img src={item.imageUrl} alt="Clothes" className="w-full h-48 object-cover" />
                {!viewMode && (
                  <button 
                    onClick={() => deleteItem(item.id)}
                    className="absolute top-2 right-2 bg-black/50 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                <div className="p-2 flex justify-between items-center text-gray-500">
                  <span className="text-xs">{new Date(item.createdAt?.toDate()).toLocaleDateString()}</span>
                  <Heart size={14} className="hover:text-red-500 cursor-pointer" />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 底部上傳按鈕 (訪客模式隱藏) */}
      {!viewMode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2">
          <label className="flex items-center gap-2 bg-pink-500 text-white px-6 py-3 rounded-full shadow-lg hover:bg-pink-600 cursor-pointer transition active:scale-95">
            {loading ? <Loader2 className="animate-spin" /> : <Plus />}
            <span className="font-bold">{loading ? "上傳中..." : "新增衣物"}</span>
            <input type="file" className="hidden" accept="image/*" onChange={handleUpload} disabled={loading} />
          </label>
        </div>
      )}
    </div>
  );
}

export default App;
