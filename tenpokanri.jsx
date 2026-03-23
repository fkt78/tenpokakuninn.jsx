<!DOCTYPE html>
<!-- 本番(Firebase Hosting)の正本は public/index.html。ここを編集する場合は public 側へ反映してください。 -->
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>店舗チェックアプリ</title>
    
    <!-- Tailwind CSS v4 (安定版CDN) -->
    <script src="https://cdn.tailwindcss.com"></script>
    
    <!-- Font Awesome -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <!-- PDF生成ライブラリ -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
    
    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700;900&display=swap" rel="stylesheet">

    <!-- Tailwind v4 設定 (CSS変数を活用) -->
    <style type="text/tailwindcss">
        @theme {
            /* フォント設定 */
            --font-sans: "Noto Sans JP", "Inter", sans-serif;

            /* カスタムカラー設定 (v4方式) */
            --color-primary-50: #eff6ff;
            --color-primary-100: #dbeafe;
            --color-primary-500: #3b82f6;
            --color-primary-600: #2563eb;
            --color-primary-700: #1d4ed8;

            --color-slate-50: #f8fafc;
            --color-slate-100: #f1f5f9;
            --color-slate-200: #e2e8f0;
            --color-slate-300: #cbd5e1;
            --color-slate-400: #94a3b8;
            --color-slate-500: #64748b;
            --color-slate-600: #475569;
            --color-slate-700: #334155;
            --color-slate-800: #1e293b;
            --color-slate-900: #0f172a;

            /* アニメーション設定 */
            --animate-fade-in: fadeIn 0.3s ease-out;
            --animate-slide-up: slideUp 0.4s ease-out;
            --animate-bounce-subtle: bounceSubtle 2s infinite;

            @keyframes fadeIn {
                0% { opacity: 0; }
                100% { opacity: 1; }
            }
            @keyframes slideUp {
                0% { transform: translateY(10px); opacity: 0; }
                100% { transform: translateY(0); opacity: 1; }
            }
            @keyframes bounceSubtle {
                0%, 100% { transform: translateY(-3%); }
                50% { transform: translateY(0); }
            }
        }
    </style>

    <style>
        /* 基本設定 */
        body { 
            font-family: 'Noto Sans JP', 'Inter', sans-serif; 
            -webkit-tap-highlight-color: transparent;
        }

        /* ユーティリティ */
        .hidden-view, .hidden-step { display: none; }
        
        /* カスタムスクロールバー */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #f1f5f9; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

        /* ドラッグ＆ドロップ */
        .sortable-item { cursor: grab; touch-action: none; }
        .sortable-item:active { cursor: grabbing; }
        .sortable-ghost { opacity: 0.4; background: #e0e7ff; border: 2px dashed #6366f1; }

        /* 縦書き（旧レイアウト用だが念のため保持） */
        .vertical-text-container {
            height: 140px;
            display: flex;
            justify-content: center;
            align-items: center;
            background: linear-gradient(to bottom, #f8fafc, #f1f5f9);
        }
        .vertical-text {
            writing-mode: vertical-rl;
            text-orientation: mixed;
            letter-spacing: 0.1em;
        }

        /* ローダー */
        .loader {
            width: 48px;
            height: 48px;
            border: 5px solid #e2e8f0;
            border-bottom-color: #3b82f6;
            border-radius: 50%;
            display: inline-block;
            box-sizing: border-box;
            animation: rotation 1s linear infinite;
        }
        @keyframes rotation {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        /* ハイライトアニメーション */
        .highlight-item {
            background-color: #fffbeb !important;
            border-color: #f59e0b !important;
            box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.2);
            transform: scale(1.02);
            z-index: 10;
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }

        /* グラスモーフィズム風カード背景 */
        .glass-panel {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
    </style>
</head>
<body class="bg-slate-50 text-slate-800 min-h-screen selection:bg-blue-100 selection:text-blue-900">

    <!-- ローディングオーバーレイ -->
    <div id="loading-overlay" class="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] flex flex-col justify-center items-center transition-opacity duration-300">
        <div class="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center">
            <div class="loader mb-4"></div>
            <p id="loading-text" class="text-slate-600 font-medium animate-pulse">接続中...</p>
        </div>
    </div>

    <!-- アプリ本体 -->
    <div id="app-container" class="max-w-5xl mx-auto min-h-screen flex flex-col hidden opacity-0 transition-opacity duration-500">
        
        <!-- ヘッダー (全画面共通) -->
        <header class="pt-6 pb-2 px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center">
                <div class="flex items-center space-x-2 text-primary-600">
                    <i class="fas fa-clipboard-check text-2xl"></i>
                    <span class="font-bold text-lg tracking-tight text-slate-800">Store Check</span>
                </div>
                <div class="text-xs text-slate-400 font-mono">v2.4</div>
            </div>
        </header>

        <main class="flex-grow p-4 sm:p-6 lg:p-8">
            
            <!-- トップページ -->
            <div id="main-app-view" class="max-w-md mx-auto w-full animate-slide-up">
                
                <div class="text-center mb-10">
                    <h1 class="text-3xl sm:text-4xl font-black text-slate-900 mb-2">店舗チェック</h1>
                    <p class="text-slate-500">日々の業務状況を記録・管理します</p>
                </div>

                <!-- ステップ1: 店舗と担当者を選択 -->
                <div id="step-1" class="glass-panel rounded-3xl shadow-xl shadow-slate-200/60 p-8 space-y-6 border border-white">
                    <div class="space-y-2">
                        <label for="store-select" class="block text-sm font-bold text-slate-700 ml-1">
                            <i class="fas fa-store mr-2 text-slate-400"></i>店舗
                        </label>
                        <div class="relative">
                            <select id="store-select" required class="appearance-none w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl p-4 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all cursor-pointer font-medium shadow-sm">
                                <option value="" selected disabled>店舗を選択してください</option>
                            </select>
                            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                                <i class="fas fa-chevron-down text-xs"></i>
                            </div>
                        </div>
                    </div>

                    <div class="space-y-2">
                        <label for="staff-select" class="block text-sm font-bold text-slate-700 ml-1">
                            <i class="fas fa-user mr-2 text-slate-400"></i>担当者
                        </label>
                        <div class="relative">
                            <select id="staff-select" required class="appearance-none w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl p-4 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all cursor-pointer font-medium shadow-sm">
                                <option value="" selected disabled>担当者を選択してください</option>
                            </select>
                            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                                <i class="fas fa-chevron-down text-xs"></i>
                            </div>
                        </div>
                    </div>

                    <button id="to-step-2" class="w-full group relative overflow-hidden bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold py-4 px-6 rounded-xl shadow-lg shadow-blue-500/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transform active:scale-[0.98]" disabled>
                        <span class="relative z-10 flex items-center justify-center gap-2">
                            次へ進む <i class="fas fa-arrow-right group-hover:translate-x-1 transition-transform"></i>
                        </span>
                    </button>
                </div>

                <!-- ステップ2: チェックカテゴリを選択 -->
                <div id="step-2" class="hidden-step animate-fade-in space-y-6">
                    
                    <!-- 選択情報カード -->
                    <div class="bg-white/80 backdrop-blur-sm rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center justify-between">
                        <div class="flex items-center gap-4">
                            <div class="bg-blue-100 p-3 rounded-full text-blue-600">
                                <i class="fas fa-store-alt text-xl"></i>
                            </div>
                            <div>
                                <p class="text-xs text-slate-400 font-medium uppercase">Current Store</p>
                                <p id="selected-store" class="font-bold text-slate-800 text-lg leading-tight"></p>
                            </div>
                        </div>
                        <div class="text-right">
                            <p class="text-xs text-slate-400 font-medium uppercase">Staff</p>
                            <p id="selected-staff" class="font-semibold text-slate-700 text-sm"></p>
                        </div>
                    </div>

                    <!-- ダッシュボードボタン -->
                    <button id="show-dashboard-btn" class="w-full group bg-white hover:bg-teal-50 border-2 border-teal-100 hover:border-teal-200 p-5 rounded-2xl flex justify-between items-center transition-all shadow-sm hover:shadow-md">
                        <div class="flex items-center gap-4">
                            <div class="bg-teal-100 text-teal-600 w-12 h-12 rounded-xl flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                                <i class="fas fa-chart-pie"></i>
                            </div>
                            <div class="text-left">
                                <span class="block font-bold text-slate-800 group-hover:text-teal-700">本日の状況ダッシュボード</span>
                                <span class="text-xs text-slate-500">全体の進捗とエラーを確認</span>
                            </div>
                        </div>
                        <div class="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center text-teal-400 group-hover:bg-teal-500 group-hover:text-white transition-colors">
                            <i class="fas fa-chevron-right text-xs"></i>
                        </div>
                    </button>

                    <div class="flex items-center gap-4 py-2">
                        <div class="h-px bg-slate-200 flex-grow"></div>
                        <span class="text-xs font-medium text-slate-400">CATEGORIES</span>
                        <div class="h-px bg-slate-200 flex-grow"></div>
                    </div>

                    <!-- カテゴリボタンリスト -->
                    <div class="space-y-3">
                        <!-- 温度チェック -->
                        <button data-category="温度チェック" class="category-btn group w-full bg-white hover:bg-rose-50 p-4 rounded-2xl border border-slate-100 hover:border-rose-100 flex items-center justify-between transition-all shadow-sm hover:shadow-md active:scale-[0.99]">
                            <div class="flex items-center gap-4 overflow-hidden">
                                <div class="bg-rose-100 text-rose-500 w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center text-xl group-hover:rotate-6 transition-transform">
                                    <i class="fas fa-thermometer-half"></i>
                                </div>
                                <div class="text-left overflow-hidden">
                                    <span class="block font-bold text-slate-800 group-hover:text-rose-700">温度チェック</span>
                                    <div class="text-xs text-slate-500 mt-0.5 category-status truncate w-full">情報取得中...</div>
                                </div>
                            </div>
                            <i class="fas fa-chevron-right text-slate-300 group-hover:text-rose-400 transition-colors"></i>
                        </button>

                        <!-- HACCP -->
                        <button data-category="HACCPチェック" class="category-btn group w-full bg-white hover:bg-emerald-50 p-4 rounded-2xl border border-slate-100 hover:border-emerald-100 flex items-center justify-between transition-all shadow-sm hover:shadow-md active:scale-[0.99]">
                            <div class="flex items-center gap-4 overflow-hidden">
                                <div class="bg-emerald-100 text-emerald-500 w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center text-xl group-hover:rotate-6 transition-transform">
                                    <i class="fas fa-clipboard-check"></i>
                                </div>
                                <div class="text-left overflow-hidden">
                                    <span class="block font-bold text-slate-800 group-hover:text-emerald-700">HACCPチェック</span>
                                    <div class="text-xs text-slate-500 mt-0.5 category-status truncate w-full">情報取得中...</div>
                                </div>
                            </div>
                            <i class="fas fa-chevron-right text-slate-300 group-hover:text-emerald-400 transition-colors"></i>
                        </button>

                        <!-- トイレ掃除 -->
                        <button data-category="トイレ掃除" class="category-btn group w-full bg-white hover:bg-sky-50 p-4 rounded-2xl border border-slate-100 hover:border-sky-100 flex items-center justify-between transition-all shadow-sm hover:shadow-md active:scale-[0.99]">
                            <div class="flex items-center gap-4 overflow-hidden">
                                <div class="bg-sky-100 text-sky-500 w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center text-xl group-hover:rotate-6 transition-transform">
                                    <i class="fas fa-restroom"></i>
                                </div>
                                <div class="text-left overflow-hidden">
                                    <span class="block font-bold text-slate-800 group-hover:text-sky-700">トイレ掃除</span>
                                    <div class="text-xs text-slate-500 mt-0.5 category-status truncate w-full">情報取得中...</div>
                                </div>
                            </div>
                            <i class="fas fa-chevron-right text-slate-300 group-hover:text-sky-400 transition-colors"></i>
                        </button>

                        <!-- 引き継ぎ -->
                        <button data-category="引き継ぎチェック" class="category-btn group w-full bg-white hover:bg-violet-50 p-4 rounded-2xl border border-slate-100 hover:border-violet-100 flex items-center justify-between transition-all shadow-sm hover:shadow-md active:scale-[0.99]">
                            <div class="flex items-center gap-4 overflow-hidden">
                                <div class="bg-violet-100 text-violet-500 w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center text-xl group-hover:rotate-6 transition-transform">
                                    <i class="fas fa-people-arrows"></i>
                                </div>
                                <div class="text-left overflow-hidden">
                                    <span class="block font-bold text-slate-800 group-hover:text-violet-700">引き継ぎチェック</span>
                                    <div class="text-xs text-slate-500 mt-0.5 category-status truncate w-full">情報取得中...</div>
                                </div>
                            </div>
                            <i class="fas fa-chevron-right text-slate-300 group-hover:text-violet-400 transition-colors"></i>
                        </button>
                    </div>

                    <button id="back-to-step-1" class="w-full mt-6 py-3 px-4 rounded-xl text-slate-500 font-semibold hover:bg-slate-100 transition-colors flex items-center justify-center gap-2">
                        <i class="fas fa-arrow-left text-sm"></i> 店舗選択に戻る
                    </button>
                </div>
            </div>
        </main>

        <!-- チェックリスト詳細画面 -->
        <div id="checklist-view" class="hidden-view w-full animate-slide-up p-4 pb-20">
             <!-- ここに各チェックリストのHTMLが動的に生成される -->
        </div>

        <!-- ダッシュボード画面 -->
        <div id="dashboard-view" class="hidden-view w-full animate-slide-up p-4 pb-20">
            <!-- ここにダッシュボードのHTMLが動的に生成される -->
        </div>
    </div>
    
    <!-- JavaScript モジュール -->
    <script type="module">
        // Firebase関連のモジュールをインポート
        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { getFirestore, doc, setDoc, collection, getDocs, addDoc, serverTimestamp, query, orderBy, limit, collectionGroup, where, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

        // --- グローバル変数定義 ---
        let app, auth, db; // Firebaseインスタンス
        const dbBasePath = 'artifacts/general-master-data/public/data';

        let storesMaster = {}, staffMaster = {}, equipmentMaster = {}, storeSettings = {};
        let haccpMaster = {}, toiletMaster = {}, handoverTaskMaster = {};
        let currentState = { store: '', storeName: '', staff: '', staffName: '', category: '', orderType: '' };
        
        // --- DOM要素の取得 ---
        const loadingOverlay = document.getElementById('loading-overlay');
        const appContainer = document.getElementById('app-container');
        const storeSelect = document.getElementById('store-select');
        const staffSelect = document.getElementById('staff-select');
        const toStep2Btn = document.getElementById('to-step-2');
        
        /**
         * アプリケーション全体を初期化するメイン関数
         */
        async function initializeApplication() {
            showLoading(true, "アプリケーションを初期化しています...");
            try {
                await initFirebase();
                await fetchMasterData();
                populateDropdowns();
                setupEventListeners();
                showLoading(false);
                // フェードインアニメーション
                setTimeout(() => {
                    appContainer.classList.remove('hidden');
                    requestAnimationFrame(() => {
                        appContainer.classList.remove('opacity-0');
                    });
                }, 100);
            } catch (error) {
                 console.error("Initialization failed:", error);
                 showAppAlert(`致命的なエラー: ${error.message}`, false);
                 showLoading(true, `初期化エラー: ${error.message}`);
            }
        }

        /**
         * Firebaseの初期化と認証を行う
         */
        async function initFirebase() {
            const firebaseConfig = {
                apiKey: "AIzaSyAvxKaj49CfK9T5-h4AycKcguU2gsSXTxc",
                authDomain: "new-check-137f9.firebaseapp.com",
                projectId: "new-check-137f9",
                storageBucket: "new-check-137f9.firebasestorage.app",
                messagingSenderId: "534868750946",
                appId: "1:534868750946:web:a10435f5d28280d1d8573b",
                measurementId: "G-63WWRYMK20"
            };

            app = initializeApp(firebaseConfig);
            db = getFirestore(app);
            auth = getAuth(app);
            
            try {
                if (!auth.currentUser) {
                    await signInAnonymously(auth);
                    console.log("Signed in anonymously to user's project.");
                }
            } catch (error) {
                console.error("Anonymous sign-in failed:", error);
                throw error;
            }
        }
        
        /**
         * Firestoreから各種マスターデータを取得する
         */
        async function fetchMasterData() {
            showLoading(true, "マスターデータを取得中...");
            
            const processSnapshot = (snapshot) => {
                const data = {};
                snapshot.forEach(doc => { data[doc.id] = doc.data(); });
                return data;
            };

            try {
                const generalMasterBasePath = 'artifacts/general-master-data/public/data';
                const employeeBasePath = 'artifacts/general-master-data/public/data';

                const masterPaths = {
                    stores: `${generalMasterBasePath}/stores`,
                    equipment: `${generalMasterBasePath}/fixtures`,
                    settings: `${generalMasterBasePath}/storeSettings`,
                    haccp: `${generalMasterBasePath}/haccp`,
                    toilet: `${generalMasterBasePath}/toilet_cleaning`,
                    handover: `${generalMasterBasePath}/handovers`,
                    staff: `${employeeBasePath}/employees`
                };

                const promises = Object.entries(masterPaths).map(async ([key, path]) => {
                    try {
                        const snapshot = await getDocs(collection(db, path));
                        return { [key]: processSnapshot(snapshot) };
                    } catch (e) {
                        console.error(`Failed to fetch ${key} from ${path}:`, e);
                        return { [key]: {} };
                    }
                });

                const results = await Promise.all(promises);
                const allData = Object.assign({}, ...results);

                storesMaster = allData.stores;
                equipmentMaster = allData.equipment;
                storeSettings = allData.settings;
                haccpMaster = allData.haccp;
                toiletMaster = allData.toilet;
                handoverTaskMaster = allData.handover;
                staffMaster = allData.staff;

                if (Object.keys(staffMaster).length === 0) {
                    showAppAlert("担当者リストの読み込みに失敗しました。", false);
                }
            } catch(error) {
                console.error("マスターデータの取得処理中に予期せぬエラーが発生しました:", error);
                throw new Error("マスターデータの取得に失敗しました。");
            }
        }
        
        /**
         * 店舗と担当者のドロップダウンを初期化・設定する
         */
        function populateDropdowns() {
            const allowedStores = ['伊賀平野東町店', '伊賀平野北谷店', '伊賀忍者市駅南店'];
            const filteredStores = Object.fromEntries(
                Object.entries(storesMaster).filter(([, storeData]) => allowedStores.includes(storeData.name))
            );
            populateSelect(storeSelect, filteredStores, false);
            const sortedStaff = getSortedStaff();
            populateSelect(staffSelect, sortedStaff, true);
        }

        /**
         * イベントリスナーをまとめて設定する
         */
        function setupEventListeners() {
            [storeSelect, staffSelect].forEach(el => {
                el.addEventListener('change', () => {
                    toStep2Btn.disabled = !(storeSelect.value && staffSelect.value);
                });
            });
            toStep2Btn.addEventListener('click', () => {
                currentState.store = storeSelect.value;
                currentState.storeName = storeSelect.options[storeSelect.selectedIndex].text.split('（')[0];
                currentState.staff = staffSelect.value;
                currentState.staffName = staffSelect.options[staffSelect.selectedIndex].text;
                document.getElementById('selected-store').textContent = currentState.storeName;
                document.getElementById('selected-staff').textContent = currentState.staffName;
                updateCategoryStatus();
                showStep(2);
            });
            document.getElementById('back-to-step-1').addEventListener('click', () => showStep(1));
            
            document.getElementById('show-dashboard-btn').addEventListener('click', () => {
                renderDashboardView();
            });

            document.querySelectorAll('.category-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    currentState.category = btn.dataset.category;
                    renderChecklistView(currentState.category);
                });
            });
        }

        // --- UI表示/非表示 制御 ---
        function showLoading(isLoading, text = "処理中...") {
            const loadingTextEl = document.getElementById('loading-text');
            const overlay = loadingOverlay;
            
            if(loadingTextEl) loadingTextEl.textContent = text;

            if (isLoading) {
                overlay.style.display = 'flex';
                setTimeout(() => overlay.classList.remove('opacity-0'), 10);
            } else {
                overlay.classList.add('opacity-0');
                setTimeout(() => overlay.style.display = 'none', 300);
            }
        }

        function showStep(step) {
            const step1 = document.getElementById('step-1');
            const step2 = document.getElementById('step-2');
            
            if (step === 1) {
                step1.classList.remove('hidden-step');
                step2.classList.add('hidden-step');
                step1.classList.add('animate-slide-up');
            } else {
                step1.classList.add('hidden-step');
                step2.classList.remove('hidden-step');
                step2.classList.add('animate-slide-up');
            }
        }
        
        function createModal(id, title, content, buttons) {
            const existingModal = document.getElementById(id);
            if(existingModal) existingModal.remove();

            const modal = document.createElement('div');
            modal.id = id;
            modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in";
            
            let buttonHTML = '';
            buttons.forEach(btn => {
                buttonHTML += `<button id="${btn.id}" class="${btn.classes} transform active:scale-95 transition-transform">${btn.text}</button>`;
            });

            modal.innerHTML = `
                <div class="bg-white w-full max-w-3xl shadow-2xl rounded-3xl overflow-hidden transform transition-all animate-slide-up flex flex-col max-h-[85vh]">
                    <div class="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                        <h3 class="text-xl font-bold text-slate-800">${title}</h3>
                        <button onclick="document.getElementById('${id}').remove()" class="text-slate-400 hover:text-slate-600 transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="p-6 overflow-y-auto flex-grow">
                        <div class="space-y-4">${content}</div>
                    </div>
                    <div class="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0">
                       ${buttonHTML}
                    </div>
                </div>`;
            
            document.body.appendChild(modal);

            buttons.forEach(btn => {
                const buttonElement = document.getElementById(btn.id);
                if (buttonElement) {
                    buttonElement.addEventListener('click', btn.onClick);
                }
            });

            return modal;
        }

        function hideModal(modalId) { document.getElementById(modalId)?.remove(); }
        
        // --- 画面描画 ---
        function renderChecklistView(category, highlightInfo = null) {
            const checklistView = document.getElementById('checklist-view');
            const mainAppView = document.getElementById('main-app-view');
            
            mainAppView.style.display = 'none';
            document.getElementById('dashboard-view').style.display = 'none';
            
            checklistView.style.display = 'block';
            checklistView.innerHTML = createChecklistViewHTML(category);
            
            document.querySelectorAll('.back-to-main').forEach(btn => btn.addEventListener('click', backToMainView));
            
            const orderTypeMap = { '温度チェック': 'equipmentOrder', 'HACCPチェック': 'haccpOrder' };
            const orderButton = checklistView.querySelector('.open-order-settings-btn');
            const historyButton = checklistView.querySelector('#show-history-btn');
            const globalSaveContainer = checklistView.querySelector('#global-save-container');
            
            historyButton.addEventListener('click', showHistory);

            if (category === 'トイレ掃除') {
                 orderButton.addEventListener('click', () => showStallTypeSelectModal());
            } else if (category === '引き継ぎチェック') {
                 orderButton.addEventListener('click', () => showHandoverSelectModal());
            } else if (orderTypeMap[category]) {
                currentState.orderType = orderTypeMap[category];
                orderButton.addEventListener('click', () => openOrderModal(category));
            } else {
                 orderButton.style.display = 'none';
            }

            if (category === '引き継ぎチェック') {
                globalSaveContainer.style.display = 'none';
            } else {
                globalSaveContainer.style.display = 'flex';
                document.getElementById('save-log-btn').addEventListener('click', handleGlobalSave);
            }
            
            const renderFunctions = {
                '温度チェック': renderTempCheckView, 'HACCPチェック': renderHaccpCheckView,
                'トイレ掃除': renderToiletCheckView, '引き継ぎチェック': renderHandoverCheckView,
            };
            
            // 少し遅延させてレンダリングすることでアニメーションをスムーズに
            requestAnimationFrame(() => {
                 renderFunctions[category]?.(highlightInfo);
            });
        }

        function backToMainView() {
            document.getElementById('checklist-view').style.display = 'none';
            document.getElementById('dashboard-view').style.display = 'none';
            document.getElementById('main-app-view').style.display = 'block';
            updateCategoryStatus();
            showStep(2);
        }

        function createChecklistViewHTML(title) {
             const layout = `<div id="checklist-container" class="space-y-6"></div>`;
            
             return `<div class="bg-white rounded-3xl shadow-xl border border-slate-100 p-4 sm:p-8">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 border-b border-slate-100 pb-6 gap-4">
                        <button class="back-to-main text-slate-500 hover:text-blue-600 font-medium transition-colors flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-blue-50">
                            <i class="fas fa-arrow-left"></i> 戻る
                        </button>
                        <div class="text-center flex-grow">
                            <span class="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">${currentState.storeName}</span>
                            <h1 class="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">${title}</h1>
                        </div>
                        <div class="flex gap-3 w-full sm:w-auto justify-end">
                          <button id="show-history-btn" class="bg-white border border-slate-200 text-slate-600 font-semibold px-4 py-2 rounded-xl hover:bg-slate-50 hover:text-blue-600 transition-colors shadow-sm flex items-center gap-2">
                              <i class="fas fa-history"></i> <span class="hidden sm:inline">履歴</span>
                          </button>
                          <button class="open-order-settings-btn bg-white border border-slate-200 text-slate-600 font-semibold px-4 py-2 rounded-xl hover:bg-slate-50 hover:text-indigo-600 transition-colors shadow-sm flex items-center gap-2">
                              <i class="fas fa-sliders-h"></i> <span class="hidden sm:inline">並び順</span>
                          </button>
                        </div>
                    </div>
                    
                    ${layout}
                    
                    <div id="global-save-container" class="mt-10 flex justify-center sm:justify-end items-center border-t border-slate-100 pt-6">
                        <button id="save-log-btn" class="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-12 rounded-xl shadow-lg shadow-blue-500/30 transition-all transform active:scale-95 flex items-center justify-center gap-3">
                            <i class="fas fa-save"></i> 保存する
                        </button>
                    </div>
                </div>`;
        }

        // --- データ処理・ユーティリティ ---
        function getSortedStaff() {
            const roleOrder = ['経営者', 'マネージャー', 'リーダー', 'クルー', 'サポーター', 'トレーニー', '外注業者', '本部OFC', 'その他'];
            return Object.fromEntries(Object.entries(staffMaster).sort(([,a], [,b]) => {
                const indexA = roleOrder.indexOf(a.role);
                const indexB = roleOrder.indexOf(b.role);
                return (indexA === -1 ? Infinity : indexA) - (indexB === -1 ? Infinity : indexB);
            }));
        }

        function populateSelect(selectEl, data, isStaff) {
            while (selectEl.options.length > 1) selectEl.remove(1);
            for (const id in data) {
                const item = data[id];
                const option = document.createElement('option');
                option.value = id;
                option.textContent = isStaff
                    ? `${(item.nickname?.trim() || `${item.lastName || ''} ${item.firstName || ''}`.trim())}（${item.role || '役職なし'}）`
                    : item.name;
                selectEl.appendChild(option);
            }
        }

        function createDropdown(options, isObject = false, data = {}) {
            const select = document.createElement('select');
            select.className = "block w-full bg-slate-50 border border-slate-200 text-slate-700 rounded-xl p-3 transition-all focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 hover:bg-white cursor-pointer";
            select.innerHTML = `<option selected disabled value="">選択...</option>`;
            
            if (isObject) {
                 for (const id in data) {
                    const item = data[id];
                    const option = document.createElement('option');
                    option.value = id;
                    option.textContent = `${(item.nickname?.trim() || `${item.lastName || ''} ${item.firstName || ''}`.trim())}（${item.role || '役職なし'}）`;
                    select.appendChild(option);
                }
            } else {
                 options.forEach(o => select.add(new Option(o, o)));
            }
            return select;
        }

        // ... (updateCategoryStatus, handleGlobalSave などのロジック部分は変更なし、スタイルのみ影響) ...
        
        // --- 以下、ロジック関数群 (基本ロジックは維持) ---
        
        async function updateCategoryStatus() {
            const dateStr = new Date().toISOString().slice(0, 10);
            const categoryMap = {
                '温度チェック': 'temperature', 'HACCPチェック': 'haccp',
                'トイレ掃除': 'toilet_cleaning', '引き継ぎチェック': 'handover',
            };

            for (const btn of document.querySelectorAll('.category-btn')) {
                const categoryName = btn.dataset.category;
                const logCategory = categoryMap[categoryName];
                const statusEl = btn.querySelector('.category-status');
                statusEl.textContent = '情報取得中...';

                if (!logCategory || !currentState.store) {
                    statusEl.textContent = '（店舗を選択してください）';
                    continue;
                }

                try {
                    let count = 0;
                    let lastLog = null;
                    const logCollectionPath = `${dbBasePath}/logs/${logCategory}/${currentState.store}/${dateStr}`;

                    if (logCategory === 'handover') {
                        const [snap1, snap2] = await Promise.all([
                            getDocs(query(collection(db, `${logCollectionPath}/handover1Order`))).catch(()=>({docs:[]})),
                            getDocs(query(collection(db, `${logCollectionPath}/handover2Order`))).catch(()=>({docs:[]}))
                        ]);
                        const allLogs = [...snap1.docs, ...snap2.docs].map(d => d.data());
                        count = allLogs.length;
                        if (count > 0) {
                            allLogs.sort((a,b) => b.createdAt.toMillis() - a.createdAt.toMillis());
                            lastLog = allLogs[0];
                        }
                    } else {
                        const logRef = collection(db, `${logCollectionPath}/entries`);
                        const q = query(logRef, orderBy('createdAt', 'desc'));
                        const snapshot = await getDocs(q);
                        count = snapshot.size;
                        if (!snapshot.empty) lastLog = snapshot.docs[0].data();
                    }
                    
                    if (lastLog) {
                        const staffId = lastLog.checkStaffId || lastLog.staffId || 'unknown';
                        const staffInfo = staffMaster[staffId] || {};
                        const staffName = staffInfo.nickname || `${staffInfo.lastName || ''} ${staffInfo.firstName || ''}`.trim() || '不明';
                        const time = lastLog.createdAt.toDate().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                        statusEl.innerHTML = `<span class="text-teal-600 font-semibold"><i class="fas fa-check-circle mr-1"></i>完了 (${count}回)</span> <span class="text-slate-400 ml-1">最終: ${staffName} ${time}</span>`;
                    } else {
                        statusEl.innerHTML = `<span class="text-slate-400"><i class="far fa-circle mr-1"></i>本日未実施</span>`;
                    }
                } catch (e) {
                    console.error(`Status update failed for ${categoryName}:`, e);
                    statusEl.textContent = '（情報取得エラー）';
                }
            }
        }

        async function handleGlobalSave() {
            const dateStr = new Date().toISOString().slice(0, 10);
            const categoryToLogType = { '温度チェック': 'temperature', 'HACCPチェック': 'haccp', 'トイレ掃除': 'toilet_cleaning' };
            const logCategory = categoryToLogType[currentState.category];
            if (!logCategory) return;

            let checks;
            // ... (データ収集ロジックは変更なし) ...
             if (currentState.category === '温度チェック') {
                checks = Array.from(document.querySelectorAll('#checklist-container [data-equipment-id]')).map(card => ({
                    equipmentId: card.dataset.equipmentId, temperature: card.querySelector('[data-field="temperature"]')?.value || null,
                    drainChecked: card.querySelector('[data-field="drain"]')?.checked ?? null, contact: card.querySelector('[data-field="contact"]')?.value || null,
                    action: card.querySelector('[data-field="action"]')?.value || null,
                }));
            } else if (currentState.category === 'HACCPチェック') {
                checks = Array.from(document.querySelectorAll('#checklist-container [data-item-id]')).map(card => ({
                    itemId: card.dataset.itemId, status: card.querySelector('[data-field="status"]')?.value || null,
                    timeSlot: card.querySelector('[data-field="timeSlot"]')?.value || null, staff: card.querySelector('[data-field="staff"]')?.value || null,
                    action: card.querySelector('[data-field="action"]')?.value || null, contact: card.querySelector('[data-field="contact"]')?.value || null
                }));
            } else if (currentState.category === 'トイレ掃除') {
                checks = {};
                document.querySelectorAll('#checklist-container .bg-slate-50').forEach(card => { // クラス名変更に対応
                    const sectionName = card.querySelector('h3').textContent;
                    const sectionChecks = {};
                    card.querySelectorAll('input[type="checkbox"]').forEach(cb => { sectionChecks[cb.dataset.taskId] = cb.checked; });
                    checks[sectionName] = sectionChecks;
                });
            }

            const logData = { 
                staffId: currentState.staff, 
                storeId: currentState.store,
                logCategory: logCategory,
                data: { checks }, 
                createdAt: serverTimestamp() 
            };
            const logCollectionPath = `${dbBasePath}/logs/${logCategory}/${currentState.store}/${dateStr}/entries`;
            
            showLoading(true, '保存中...');
            try {
                await addDoc(collection(db, logCollectionPath), logData);
                showAppAlert('保存しました。');
                await updateCategoryStatus();
            } catch (error) {
                console.error("保存に失敗:", error);
                showAppAlert("保存に失敗しました。", false);
            } finally {
                showLoading(false);
            }
        }

        // ... (handleHandoverSave, 履歴機能などはロジック変更なし) ...
        async function handleHandoverSave(event) {
            const card = event.target.closest('.handover-section');
            if (!card) return;

            const orderType = card.dataset.orderType;
            const timeStaffId = card.querySelector('[data-field="timeStaffId"]').value;
            const checkStaffId = card.querySelector('[data-field="checkStaffId"]').value;
            const startTime = card.querySelector('[data-field="startTime"]').value;
            const endTime = card.querySelector('[data-field="endTime"]').value;
            const stampCount = card.querySelector('[data-field="stampCount"]').value;
            
            if (!timeStaffId || !checkStaffId || !startTime || !endTime || !stampCount) {
                showAppAlert('担当者、時間、印紙枚数をすべて入力してください。', false);
                return;
            }

            const checkedTasks = {};
            card.querySelectorAll('input[type="checkbox"][data-task-id]').forEach(cb => { checkedTasks[cb.dataset.taskId] = cb.checked; });
            
            const logData = { 
                timeStaffId, checkStaffId, startTime, endTime, stampCount, checkedTasks, 
                storeId: currentState.store, createdAt: serverTimestamp() 
            };
            const dateStr = new Date().toISOString().slice(0, 10);
            const logCollectionPath = `${dbBasePath}/logs/handover/${currentState.store}/${dateStr}/${orderType}`;
            
            showLoading(true, '保存中...');
            try {
                await addDoc(collection(db, logCollectionPath), logData);
                showAppAlert(`${card.querySelector('h3').textContent} の情報を保存しました。`);
                await updateCategoryStatus();
            } catch (error) {
                console.error("引き継ぎ情報の保存に失敗:", error);
                showAppAlert("保存に失敗しました。", false);
            } finally {
                showLoading(false);
            }
        }

        function showHistory() {
            const date = new Date();
            renderCalendarModal(date);
        }
        
        // カレンダーのデザイン修正
        function renderCalendarModal(date) {
            const year = date.getFullYear();
            const month = date.getMonth();
            const content = `
                <div class="flex justify-between items-center mb-6">
                    <button id="prev-month-btn" class="w-10 h-10 rounded-full bg-slate-100 hover:bg-blue-100 hover:text-blue-600 transition-colors flex items-center justify-center"><i class="fas fa-chevron-left"></i></button>
                    <h4 id="calendar-title" class="text-xl font-bold text-slate-800">${year}年 ${month + 1}月</h4>
                    <button id="next-month-btn" class="w-10 h-10 rounded-full bg-slate-100 hover:bg-blue-100 hover:text-blue-600 transition-colors flex items-center justify-center"><i class="fas fa-chevron-right"></i></button>
                </div>
                <div id="calendar-body" class="grid grid-cols-7 gap-2 text-center"></div>
            `;
            const buttons = [{ id: 'calendar-close-btn', text: '閉じる', classes: 'px-6 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200', onClick: () => hideModal('calendar-modal')}];
            createModal('calendar-modal', `${currentState.category} の履歴`, content, buttons);
            
            document.getElementById('prev-month-btn').addEventListener('click', () => { date.setMonth(date.getMonth() - 1); renderCalendarModal(date); });
            document.getElementById('next-month-btn').addEventListener('click', () => { date.setMonth(date.getMonth() + 1); renderCalendarModal(date); });

            generateCalendar(year, month);
        }

         async function generateCalendar(year, month) {
            const calendarBody = document.getElementById('calendar-body');
            if (!calendarBody) return;
            calendarBody.innerHTML = '<div class="col-span-7 py-8"><div class="loader mx-auto"></div></div>'; 

            const days = ['日', '月', '火', '水', '木', '金', '土'];
            calendarBody.innerHTML = days.map(day => `<div class="font-bold text-sm text-slate-400 pb-2">${day}</div>`).join('');

            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            const firstDayOfWeek = firstDay.getDay();
            const lastDate = lastDay.getDate();

            for (let i = 0; i < firstDayOfWeek; i++) calendarBody.innerHTML += '<div></div>';

            const logs = await fetchLogsForMonth(year, month);
            const logsByDate = {};
            logs.forEach(log => {
                const date = log.createdAt.toDate().getDate();
                if (!logsByDate[date]) logsByDate[date] = [];
                logsByDate[date].push(log);
            });

            for (let date = 1; date <= lastDate; date++) {
                const dayCell = document.createElement('div');
                dayCell.className = "calendar-day p-1 border border-slate-100 rounded-xl h-20 flex flex-col bg-white hover:border-blue-300 transition-colors cursor-pointer";
                
                const dateNum = document.createElement('span');
                dateNum.className = "font-semibold text-slate-600 text-sm p-1";
                dateNum.textContent = date;
                dayCell.appendChild(dateNum);

                if (logsByDate[date]) {
                    dayCell.classList.add('has-log', '!bg-blue-50', '!border-blue-200');
                    const logCount = document.createElement('span');
                    logCount.className = "mt-auto text-xs bg-blue-500 text-white rounded-full px-2 py-0.5 self-center font-bold shadow-sm mb-1";
                    logCount.textContent = `${logsByDate[date].length}`;
                    dayCell.appendChild(logCount);

                    dayCell.addEventListener('click', () => showLogsForDay(new Date(year, month, date), logsByDate[date]));
                }
                calendarBody.appendChild(dayCell);
            }
        }
        
        // ... (fetchLogsForMonth, showLogsForDay, generateLogDetailHTML などはロジック維持、スタイルの微調整はCSSクラスで対応) ...
        async function fetchLogsForMonth(year, month) {
            const categoryToLogType = { '温度チェック': 'temperature', 'HACCPチェック': 'haccp', 'トイレ掃除': 'toilet_cleaning', '引き継ぎチェック': 'handover' };
            const logCategory = categoryToLogType[currentState.category];
            if (!logCategory) return [];

            const startDate = Timestamp.fromDate(new Date(year, month, 1));
            const endDate = Timestamp.fromDate(new Date(year, month + 1, 0, 23, 59, 59));

            let allLogs = [];
            try {
                if (logCategory === 'handover') {
                    const q1 = query(collectionGroup(db, 'handover1Order'), where('storeId', '==', currentState.store), where('createdAt', '>=', startDate), where('createdAt', '<=', endDate));
                    const q2 = query(collectionGroup(db, 'handover2Order'), where('storeId', '==', currentState.store), where('createdAt', '>=', startDate), where('createdAt', '<=', endDate));
                    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
                    const logs1 = snap1.docs.map(d => ({...d.data(), id: d.id}));
                    const logs2 = snap2.docs.map(d => ({...d.data(), id: d.id}));
                    allLogs = [...logs1, ...logs2];
                } else {
                    const q = query(collectionGroup(db, 'entries'), where('storeId', '==', currentState.store), where('logCategory', '==', logCategory), where('createdAt', '>=', startDate), where('createdAt', '<=', endDate));
                    const snapshot = await getDocs(q);
                    allLogs = snapshot.docs.map(doc => ({...doc.data(), id: doc.id}));
                }
                return allLogs.filter(log => log.createdAt);
            } catch (e) {
                console.error("月間履歴の取得に失敗:", e);
                const errorMessage = `履歴の取得に失敗しました。この機能を利用するには、Firebaseコンソールでインデックスを作成する必要があります。エラーメッセージ内のリンクをクリックしてインデックスを作成してください。`;
                showAppAlert(errorMessage, false);
                return [];
            }
        }

        function showLogsForDay(date, logs) {
             logs.sort((a,b) => b.createdAt.toMillis() - a.createdAt.toMillis());
                
            let listContent = logs.map(log => {
                const staffId = log.checkStaffId || log.staffId || 'unknown';
                const staffInfo = staffMaster[staffId] || {};
                const staffName = staffInfo.nickname || `${staffInfo.lastName || ''} ${staffInfo.firstName || ''}`.trim() || '不明';
                const time = log.createdAt.toDate().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                return `<button data-log-id="${log.id}" class="history-item-btn w-full text-left p-4 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-all flex justify-between items-center group">
                            <span class="font-bold text-slate-700">${time}</span>
                            <span class="text-slate-500 group-hover:text-blue-600">${staffName} <i class="fas fa-chevron-right ml-2 text-xs opacity-50"></i></span>
                        </button>`;
            }).join('');
            
            const buttons = [
                { id: 'print-day-history-btn', text: 'PDF保存', classes: 'px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/30', onClick: () => printHistory(logs, date)},
                { id: 'day-logs-close-btn', text: '閉じる', classes: 'px-6 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200', onClick: () => hideModal('day-logs-modal')}
            ];
            createModal('day-logs-modal', `${date.toLocaleDateString('ja-JP')} の履歴`, `<div class="space-y-3">${listContent}</div>`, buttons);
            
            document.querySelectorAll('.history-item-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const logId = btn.dataset.logId;
                    const logData = logs.find(log => log.id === logId);
                    showHistoryDetail(logData);
                });
            });
        }

        function generateLogDetailHTML(logData) {
            // (既存のロジックを利用、スタイルの調整は親コンテナで行う)
            const time = logData.createdAt.toDate().toLocaleString('ja-JP');
            let detailHTML = `<div class="text-left space-y-6 p-2">
                <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <p class="text-sm text-slate-500">記録日時</p>
                    <p class="font-bold text-lg text-slate-800">${time}</p>
                `;
            
            const category = currentState.category;
            if (category === '引き継ぎチェック') {
                 // ...
                 // 省略: 構造は同じでクラス名を調整
                  if (logData.timeStaffId && logData.checkStaffId) {
                    const timeStaffInfo = staffMaster[logData.timeStaffId] || {};
                    const timeStaffName = timeStaffInfo.nickname || `${timeStaffInfo.lastName || ''} ${timeStaffInfo.firstName || ''}`.trim() || '不明';
                    const checkStaffInfo = staffMaster[logData.checkStaffId] || {};
                    const checkStaffName = checkStaffInfo.nickname || `${checkStaffInfo.lastName || ''} ${checkStaffInfo.firstName || ''}`.trim() || '不明';
                    detailHTML += `<div class="mt-2 pt-2 border-t border-slate-200 grid grid-cols-2 gap-4">
                                    <div><p class="text-xs text-slate-500">時間担当</p><p class="font-semibold">${timeStaffName}</p></div>
                                    <div><p class="text-xs text-slate-500">チェック担当</p><p class="font-semibold">${checkStaffName}</p></div>
                                   </div>`;
                } else {
                    const staffInfo = staffMaster[logData.staffId] || {};
                    const staffName = staffInfo.nickname || `${staffInfo.lastName || ''} ${staffInfo.firstName || ''}`.trim() || '不明';
                    detailHTML += `<div class="mt-2 pt-2 border-t border-slate-200"><p class="text-xs text-slate-500">担当者</p><p class="font-semibold">${staffName}</p></div>`;
                }
            } else {
                const staffInfo = staffMaster[logData.staffId] || {};
                const staffName = staffInfo.nickname || `${staffInfo.lastName || ''} ${staffInfo.firstName || ''}`.trim() || '不明';
                detailHTML += `<div class="mt-2 pt-2 border-t border-slate-200"><p class="text-xs text-slate-500">担当者</p><p class="font-semibold">${staffName}</p></div>`;
            }
            detailHTML += `</div>`; // 最初のブロック終了

            // ... コンテンツ生成 ...
            if (category === '温度チェック') {
                logData.data.checks.forEach(check => {
                     const itemInfo = equipmentMaster[check.equipmentId] || {};
                    const itemName = itemInfo.name || '不明な備品';
                    const temp_min = parseFloat(itemInfo.temp_min);
                    const temp_max = parseFloat(itemInfo.temp_max);
                    const tempValue = parseFloat(check.temperature);
                    let tempDisplay = '<span class="text-rose-500 font-bold bg-rose-50 px-2 py-1 rounded">未入力</span>';
                    
                    if (check.temperature !== null) {
                        const isOk = (!isNaN(tempValue) && !isNaN(temp_min) && !isNaN(temp_max) && tempValue >= temp_min && tempValue <= temp_max);
                        const tempClass = isOk ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold bg-rose-50 px-2 py-1 rounded';
                        tempDisplay = `<span class="${tempClass}">${check.temperature} ℃</span>`;
                    }

                    detailHTML += `<div class="p-4 bg-white border border-slate-200 rounded-xl shadow-sm mt-3">
                        <p class="font-bold text-slate-800 border-b border-slate-100 pb-2 mb-2">${itemName}</p>
                        <div class="grid grid-cols-2 gap-y-2 text-sm">
                            <p class="text-slate-500">温度: ${tempDisplay}</p>
                            <p class="text-slate-500">排水: ${check.drainChecked ? '<span class="text-emerald-600"><i class="fas fa-check"></i> 実施</span>' : '<span class="text-rose-500 font-bold">未実施</span>'}</p>
                            <p class="text-slate-500 col-span-2">連絡先: ${check.contact || '-'}</p>
                            <p class="text-slate-500 col-span-2">処置: ${check.action || '-'}</p>
                        </div>
                    </div>`;
                });
            }
            // ... 他カテゴリも同様にデザイン適用 ...
             else if (category === 'HACCPチェック') {
                 detailHTML += `<div class="overflow-hidden rounded-xl border border-slate-200 shadow-sm mt-4"><table class="w-full text-left text-sm">
                    <thead class="bg-slate-50 text-slate-500 font-medium border-b border-slate-200"><tr>
                    <th class="p-3">項目</th><th class="p-3">状況</th><th class="p-3">時間</th><th class="p-3">担当</th>
                 </tr></thead><tbody class="divide-y divide-slate-100 bg-white">`;
                 logData.data.checks.forEach(check => {
                     const itemName = haccpMaster[check.itemId]?.name || '不明な項目';
                     const staff = staffMaster[check.staff] || {};
                     const checkedStaffName = staff.nickname || `${staff.lastName || ''} ${staff.firstName || ''}`.trim() || '-';
                     const statusClass = check.status === '未実施' ? 'text-rose-500 font-bold' : 'text-emerald-600 font-medium';
                     detailHTML += `<tr>
                        <td class="p-3 font-medium text-slate-700">${itemName}</td>
                        <td class="p-3 ${statusClass}">${check.status || '-'}</td>
                        <td class="p-3 text-slate-500">${check.timeSlot || '-'}</td>
                        <td class="p-3 text-slate-500">${checkedStaffName}</td>
                     </tr>`;
                 });
                 detailHTML += `</tbody></table></div>`;
            } else if (category === 'トイレ掃除') {
                 for(const section in logData.data.checks) {
                     detailHTML += `<div class="mt-6"><h4 class="font-bold text-slate-700 mb-2 flex items-center"><i class="fas fa-caret-right text-blue-400 mr-2"></i>${section}</h4>
                     <ul class="grid grid-cols-1 gap-2">`;
                     for(const taskId in logData.data.checks[section]){
                         const taskName = toiletMaster[taskId]?.name || '不明な項目';
                         const isChecked = logData.data.checks[section][taskId];
                         const itemClass = !isChecked ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-100 bg-white text-slate-600';
                         const icon = isChecked ? '<i class="fas fa-check text-emerald-500"></i>' : '<i class="fas fa-times text-rose-400"></i>';
                         detailHTML += `<li class="p-3 rounded-lg border ${itemClass} flex justify-between items-center text-sm"><span>${taskName}</span>${icon}</li>`;
                     }
                     detailHTML += `</ul></div>`;
                 }
            } else if (category === '引き継ぎチェック') {
                const stampCount = parseInt(logData.stampCount, 10);
                const stampClass = stampCount <= 2 ? 'text-rose-600 font-bold bg-rose-50 px-2 py-1 rounded' : 'font-medium';

                detailHTML += `<div class="grid grid-cols-2 gap-4 mt-4 bg-white p-4 rounded-xl border border-slate-200">
                                <div><p class="text-xs text-slate-400">開始時間</p><p class="font-mono font-semibold">${logData.startTime}</p></div>
                                <div><p class="text-xs text-slate-400">終了時間</p><p class="font-mono font-semibold">${logData.endTime}</p></div>
                                <div class="col-span-2"><p class="text-xs text-slate-400">印紙枚数</p><p class="${stampClass}">${logData.stampCount} 枚</p></div>
                               </div>
                               <h4 class="font-bold mt-6 text-slate-700">チェック項目</h4>
                               <ul class="grid grid-cols-1 gap-2 mt-2">`;
                for(const taskId in logData.checkedTasks){
                     const taskName = handoverTaskMaster[taskId]?.name || '不明な項目';
                     const isChecked = logData.checkedTasks[taskId];
                     const itemClass = !isChecked ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-100 bg-white text-slate-600';
                     const icon = isChecked ? '<i class="fas fa-check text-emerald-500"></i>' : '<i class="fas fa-times text-rose-400"></i>';
                     detailHTML += `<li class="p-3 rounded-lg border ${itemClass} flex justify-between items-center text-sm"><span>${taskName}</span>${icon}</li>`;
                }
                detailHTML += `</ul>`;
            }
            return detailHTML + '</div>';
        }
        
        function showHistoryDetail(logData) {
            const detailHTML = generateLogDetailHTML(logData);
            const buttons = [
                {id: 'print-single-history-btn', text: 'PDF保存', classes: 'px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/30', onClick: () => printHistory([logData])},
                {id: 'history-detail-close-btn', text: '閉じる', classes: 'px-6 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200', onClick: () => hideModal('history-detail-modal')}
            ];
            createModal('history-detail-modal', '履歴詳細', detailHTML, buttons);
        }
        
        async function printHistory(logs, date = null) {
            // (ロジック変更なし)
            showLoading(true, 'PDFを生成中...');
            const { jsPDF } = window.jspdf;
            
            let printContainer = document.createElement('div');
            printContainer.id = 'print-container-temp';
            printContainer.style.position = 'absolute';
            printContainer.style.left = '-9999px';
            printContainer.style.width = '210mm';
            printContainer.style.fontFamily = "'Noto Sans JP', sans-serif"; // フォント適用
            
            const titleDate = date ? date.toLocaleDateString('ja-JP') : '全期間';
            let printContent = `
                <div class="p-8">
                    <h1 class="text-2xl font-bold mb-4 border-b pb-2">${currentState.storeName}</h1>
                    <h2 class="text-xl font-semibold mb-6">${currentState.category} - ${titleDate} 履歴</h2>
            `;
            logs.forEach(log => {
                printContent += generateLogDetailHTML(log);
                printContent += '<hr class="my-8 border-slate-300">';
            });
            printContent += `</div>`;
            printContainer.innerHTML = printContent;
            document.body.appendChild(printContainer);

            try {
                const canvas = await html2canvas(printContainer, { scale: 2, useCORS: true });
                const imgData = canvas.toDataURL('image/png');
                const pdf = new jsPDF('p', 'mm', 'a4');
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const imgWidth = canvas.width;
                const imgHeight = canvas.height;
                const ratio = imgHeight / imgWidth;
                let height = pdfWidth * ratio;
                let position = 0;

                if (height > pdf.internal.pageSize.getHeight()) {
                   let pageHeight = pdf.internal.pageSize.getHeight();
                   pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, height);
                   height -= pageHeight;
                   while (height > 0) {
                       position -= pageHeight;
                       pdf.addPage();
                       pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, height);
                       height -= pageHeight;
                   }
                } else {
                   pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, height);
                }
                pdf.save(`${currentState.category}_${titleDate}_履歴.pdf`);
            } catch (error) {
                console.error("PDF生成失敗:", error);
                showAppAlert("PDFの生成に失敗しました。", false);
            } finally {
                showLoading(false);
                document.body.removeChild(printContainer);
            }
        }

        // --- モーダル系のデザイン改善 ---
        function showStallTypeSelectModal() {
            const content = `<div class="grid grid-cols-1 gap-4">
                             <button id="modal-edit-large-stall-btn" class="w-full bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 text-slate-700 font-bold py-4 px-6 rounded-2xl shadow-sm hover:shadow-md transition-all flex items-center justify-between group">
                                <span class="flex items-center gap-3"><span class="bg-blue-100 text-blue-600 w-10 h-10 rounded-lg flex items-center justify-center"><i class="fas fa-door-closed"></i></span> 個室大</span>
                                <i class="fas fa-chevron-right text-slate-300 group-hover:text-blue-400"></i>
                             </button>
                             <button id="modal-edit-small-stall-btn" class="w-full bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 text-slate-700 font-bold py-4 px-6 rounded-2xl shadow-sm hover:shadow-md transition-all flex items-center justify-between group">
                                <span class="flex items-center gap-3"><span class="bg-blue-100 text-blue-600 w-10 h-10 rounded-lg flex items-center justify-center"><i class="fas fa-door-open"></i></span> 個室小</span>
                                <i class="fas fa-chevron-right text-slate-300 group-hover:text-blue-400"></i>
                             </button>
                             </div>`;
            const buttons = [{ id: 'modal-cancel-stall-btn', text: 'キャンセル', classes: 'px-6 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200', onClick: () => hideModal('stall-select-modal') }];
            createModal('stall-select-modal', '編集する項目を選択', content, buttons);
            document.getElementById('modal-edit-large-stall-btn').addEventListener('click', () => openOrderModalForCategory('toiletLargeStallOrder', '個室大の項目設定'));
            document.getElementById('modal-edit-small-stall-btn').addEventListener('click', () => openOrderModalForCategory('toiletSmallStallOrder', '個室小の項目設定'));
        }
        // (showHandoverSelectModal も同様のデザインパターンに修正)
        function showHandoverSelectModal() {
             const content = `<div class="grid grid-cols-1 gap-4">
                             <button id="modal-edit-handover-1-btn" class="w-full bg-white hover:bg-violet-50 border border-slate-200 hover:border-violet-200 text-slate-700 font-bold py-4 px-6 rounded-2xl shadow-sm hover:shadow-md transition-all flex items-center justify-between group">
                                <span class="flex items-center gap-3"><span class="bg-violet-100 text-violet-600 w-10 h-10 rounded-lg flex items-center justify-center"><i class="fas fa-cash-register"></i></span> 1レジ</span>
                                <i class="fas fa-chevron-right text-slate-300 group-hover:text-violet-400"></i>
                             </button>
                             <button id="modal-edit-handover-2-btn" class="w-full bg-white hover:bg-violet-50 border border-slate-200 hover:border-violet-200 text-slate-700 font-bold py-4 px-6 rounded-2xl shadow-sm hover:shadow-md transition-all flex items-center justify-between group">
                                <span class="flex items-center gap-3"><span class="bg-violet-100 text-violet-600 w-10 h-10 rounded-lg flex items-center justify-center"><i class="fas fa-cash-register"></i></span> 2レジ</span>
                                <i class="fas fa-chevron-right text-slate-300 group-hover:text-violet-400"></i>
                             </button>
                             </div>`;
            const buttons = [{ id: 'modal-cancel-handover-btn', text: 'キャンセル', classes: 'px-6 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200', onClick: () => hideModal('handover-select-modal') }];
            createModal('handover-select-modal', '編集するレジを選択', content, buttons);
            document.getElementById('modal-edit-handover-1-btn').addEventListener('click', () => openOrderModalForCategory('handover1Order', '1レジの項目設定'));
            document.getElementById('modal-edit-handover-2-btn').addEventListener('click', () => openOrderModalForCategory('handover2Order', '2レジの項目設定'));
        }

        function openOrderModalForCategory(orderType, title) {
            currentState.orderType = orderType;
            hideModal('stall-select-modal');
            hideModal('handover-select-modal');
            openOrderModal(title);
        }

        function openOrderModal(title) {
            const content = `<div id="order-list-container" class="space-y-6">
                                <div>
                                    <h4 class="text-sm font-bold text-slate-500 mb-3 uppercase tracking-wide">表示する項目 <span class="text-xs font-normal normal-case ml-2 text-slate-400">(ドラッグで並び替え)</span></h4>
                                    <div id="active-list" class="p-3 border-2 border-dashed border-blue-200 rounded-xl min-h-[120px] bg-blue-50/50 space-y-2"></div>
                                </div>
                                <div>
                                    <h4 class="text-sm font-bold text-slate-500 mb-3 uppercase tracking-wide">追加可能な項目 <span class="text-xs font-normal normal-case ml-2 text-slate-400">(非表示)</span></h4>
                                    <div id="available-list" class="p-3 border border-slate-200 rounded-xl min-h-[120px] bg-slate-50 space-y-2"></div>
                                </div>
                             </div>`;
            const buttons = [
                { id: 'cancel-order-btn', text: '戻る', classes: 'px-6 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200', onClick: () => hideModal('order-modal')},
                { id: 'save-order-btn', text: '保存', classes: 'px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/30', onClick: saveOrder}
            ];
            createModal('order-modal', title, content, buttons);
            
            populateOrderLists();

            // ... (ドラッグ&ドロップロジックは変更なし) ...
            const orderListContainer = document.getElementById('order-list-container');
            orderListContainer.addEventListener('click', (e) => {
                const target = e.target.closest('button');
                if (!target) return;
                const item = target.closest('[data-id]');
                if (!item) return;
                const id = item.dataset.id;
                const activeList = document.getElementById('active-list');
                const availableList = document.getElementById('available-list');
                let activeIds = Array.from(activeList.children).map(child => child.dataset.id);
                let availableIds = Array.from(availableList.children).map(child => child.dataset.id);

                if (target.classList.contains('add-item-btn')) {
                    availableIds = availableIds.filter(i => i !== id);
                    activeIds.push(id);
                    renderOrderLists(activeIds, availableIds);
                } else if (target.classList.contains('remove-item-btn')) {
                    activeIds = activeIds.filter(i => i !== id);
                    availableIds.push(id);
                    renderOrderLists(activeIds, availableIds);
                }
            });

            const activeList = document.getElementById('active-list');
            // (ドラッグイベントハンドラは以前と同じロジックを使用)
            activeList.addEventListener('dragstart', e => { if (e.target.closest('.sortable-item')) e.target.closest('.sortable-item').classList.add('sortable-ghost'); });
            activeList.addEventListener('dragend', e => { if (e.target.closest('.sortable-item')) e.target.closest('.sortable-item').classList.remove('sortable-ghost'); });
            activeList.addEventListener('dragover', e => {
                e.preventDefault();
                const draggingItem = document.querySelector('.sortable-ghost');
                if (!draggingItem) return;
                const afterElement = getDragAfterElement(activeList, e.clientY);
                if (afterElement == null) activeList.appendChild(draggingItem);
                else activeList.insertBefore(draggingItem, afterElement);
            });
            activeList.addEventListener('touchstart', e => {
                const draggingItem = e.target.closest('.sortable-item');
                if (!draggingItem) return;
                e.preventDefault();
                draggingItem.classList.add('sortable-ghost');
                const touchMoveHandler = (moveEvent) => {
                    moveEvent.preventDefault();
                    const touch = moveEvent.touches[0];
                    const dropTarget = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('#active-list');
                    if (dropTarget) {
                         const afterElement = getDragAfterElement(dropTarget, touch.clientY);
                         if (afterElement == null) dropTarget.appendChild(draggingItem);
                         else dropTarget.insertBefore(draggingItem, afterElement);
                    }
                };
                const touchEndHandler = () => {
                    draggingItem.classList.remove('sortable-ghost');
                    document.removeEventListener('touchmove', touchMoveHandler);
                    document.removeEventListener('touchend', touchEndHandler);
                };
                document.addEventListener('touchmove', touchMoveHandler, { passive: false });
                document.addEventListener('touchend', touchEndHandler, { passive: false });
            }, { passive: false });
        }

        // --- Order Modalのデザインロジック ---
        function populateOrderLists() {
             // (ロジック変更なし)
            let masterData;
            switch (currentState.orderType) {
                case 'equipmentOrder': masterData = equipmentMaster; break;
                case 'haccpOrder': masterData = haccpMaster; break;
                case 'toiletLargeStallOrder': case 'toiletSmallStallOrder': masterData = toiletMaster; break;
                case 'handover1Order': case 'handover2Order': masterData = handoverTaskMaster; break;
                default: masterData = {};
            }
            const currentOrder = storeSettings[currentState.store]?.[currentState.orderType] || [];
            const currentOrderSet = new Set(currentOrder);
            const activeIds = currentOrder.filter(id => masterData[id]);
            const availableIds = Object.keys(masterData).filter(id => !currentOrderSet.has(id));
            renderOrderLists(activeIds, availableIds);
        }

        function renderOrderLists(activeIds, availableIds) {
             // (ロジック変更なし、HTML生成部分のみデザイン変更)
            let masterData;
            switch (currentState.orderType) {
                case 'equipmentOrder': masterData = equipmentMaster; break;
                case 'haccpOrder': masterData = haccpMaster; break;
                case 'toiletLargeStallOrder': case 'toiletSmallStallOrder': masterData = toiletMaster; break;
                case 'handover1Order': case 'handover2Order': masterData = handoverTaskMaster; break;
                default: masterData = {};
            }

            const activeList = document.getElementById('active-list');
            const availableList = document.getElementById('available-list');
            if (!activeList || !availableList) return;
            activeList.innerHTML = '';
            availableList.innerHTML = '';

            activeIds.forEach(id => {
                const item = masterData[id];
                if (!item) return;
                const div = document.createElement('div');
                div.className = "sortable-item p-3 bg-white border border-slate-200 rounded-xl shadow-sm flex items-center justify-between cursor-grab active:cursor-grabbing hover:border-blue-400 transition-colors";
                div.draggable = true;
                div.dataset.id = id;
                div.innerHTML = `<div class="flex items-center flex-grow">
                                    <div class="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 mr-3"><i class="fas fa-grip-lines"></i></div>
                                    <span class="flex-grow text-left font-medium text-slate-700">${item.name}</span>
                                 </div>
                                 <button class="remove-item-btn text-rose-400 hover:text-rose-600 p-2 hover:bg-rose-50 rounded-lg transition-colors"><i class="fas fa-trash-alt"></i></button>`;
                activeList.appendChild(div);
            });

            availableIds.sort((a, b) => masterData[a].name.localeCompare(masterData[b].name, 'ja')).forEach(id => {
                const item = masterData[id];
                if (!item) return;
                const div = document.createElement('div');
                div.className = "p-3 bg-white border border-slate-200 rounded-xl shadow-sm flex items-center justify-between hover:bg-slate-50 transition-colors";
                div.dataset.id = id;
                div.innerHTML = `<span class="flex-grow text-left text-slate-600 ml-2">${item.name}</span>
                                 <button class="add-item-btn text-emerald-500 hover:text-emerald-700 font-semibold text-sm bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors"><i class="fas fa-plus mr-1"></i> 追加</button>`;
                availableList.appendChild(div);
            });
        }
        
        async function saveOrder() {
             // (ロジック変更なし)
            const newOrder = [...document.getElementById('active-list').children].map(item => item.dataset.id);
            if (!currentState.orderType || !currentState.store) return;
            const settingsRef = doc(db, `${dbBasePath}/storeSettings`, currentState.store);
            showLoading(true, "並び順を保存中...");
            try {
                await setDoc(settingsRef, { [currentState.orderType]: newOrder }, { merge: true });
                if (!storeSettings[currentState.store]) storeSettings[currentState.store] = {};
                storeSettings[currentState.store][currentState.orderType] = newOrder;
                renderChecklistView(currentState.category);
                hideModal('order-modal');
                showAppAlert('並び順を保存しました。');
            } catch (error) { 
                console.error("並び順の保存に失敗:", error); 
                showAppAlert("エラーが発生しました。", false); 
            } finally {
                showLoading(false);
            }
        }
        
        function getDragAfterElement(container, y) {
             // (ロジック変更なし)
            const draggableElements = [...container.querySelectorAll('.sortable-item:not(.sortable-ghost)')];
            return draggableElements.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = y - box.top - box.height / 2;
                if (offset < 0 && offset > closest.offset) return { offset, element: child };
                else return closest;
            }, { offset: Number.NEGATIVE_INFINITY }).element;
        }
        
        function showWarningAlert(message) {
             if (!message || message.trim() === '') return;
             const buttons = [{ id: 'warning-ok-btn-dynamic', text: '確認しました', classes: 'w-full px-6 py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 shadow-lg shadow-rose-500/30', onClick: () => hideModal('warning-modal-dynamic')}];
             // デザインを少しリッチに
             const content = `<div class="text-center"><div class="bg-rose-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><i class="fas fa-exclamation-triangle text-2xl text-rose-500"></i></div><p class="text-slate-600 whitespace-pre-wrap leading-relaxed">${message}</p></div>`;
            createModal('warning-modal-dynamic', '警告', content, buttons);
        }
        
        function showAppAlert(message, isSuccess = true) {
            const alertBox = document.createElement('div');
            const bgClass = isSuccess ? 'bg-emerald-500' : 'bg-rose-500';
            const icon = isSuccess ? 'fa-check-circle' : 'fa-exclamation-circle';
            alertBox.className = `fixed top-5 right-5 px-6 py-4 rounded-xl shadow-2xl text-white z-[10000] transition-all duration-500 transform translate-y-[-20px] opacity-0 ${bgClass} flex items-center gap-3 font-bold`;
            alertBox.innerHTML = `<i class="fas ${icon} text-xl"></i> <span>${message}</span>`;
            document.body.appendChild(alertBox);
            
            // アニメーション
            requestAnimationFrame(() => {
                alertBox.classList.remove('translate-y-[-20px]', 'opacity-0');
            });

            setTimeout(() => {
                alertBox.classList.add('translate-y-[-20px]', 'opacity-0');
                setTimeout(() => alertBox.remove(), 500);
            }, 3000);
        }
        
        // --- 各チェック項目の描画関数 (カードデザインの適用) ---
        function renderTempCheckView(highlightInfo = null) {
            const container = document.getElementById('checklist-container');
            if(!container) return;
            container.innerHTML = '';
            const equipmentOrder = storeSettings[currentState.store]?.equipmentOrder || Object.keys(equipmentMaster);

            equipmentOrder.forEach(id => {
                const item = equipmentMaster[id];
                if (!item) return;

                const card = document.createElement('div');
                card.className = "bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow space-y-4"; // デザイン変更
                card.dataset.equipmentId = id;
                
                const temp_min = parseFloat(item.temp_min);
                const temp_max = parseFloat(item.temp_max);
                const hasTempRange = !isNaN(temp_min) && !isNaN(temp_max);
                const tempRange = hasTempRange ? `${temp_min}℃ ~ ${temp_max}℃` : '未設定';
                const modelInfo = (item.model_number ? `型番: ${item.model_number}` : '') + (item.model_type ? ` 型式: ${item.model_type}` : '');

                let tempDropdownHTML = '';
                if(hasTempRange){
                    const options = [];
                    for(let i = Math.floor(temp_min - 5); i <= Math.ceil(temp_max + 5); i+=0.5) options.push(i.toFixed(1));
                    tempDropdownHTML = createDropdown(options).outerHTML;
                } else {
                    tempDropdownHTML = '<input type="number" class="block w-full bg-slate-100 border border-slate-200 rounded-xl p-3 text-slate-500" disabled placeholder="範囲未設定">';
                }
                
                let drainCheckboxHTML = '';
                if(item.manual_drain === true){
                    drainCheckboxHTML = `<div class="flex items-center h-full pt-6">
                        <label class="flex items-center cursor-pointer group">
                            <div class="relative">
                                <input id="drain-check-${id}" type="checkbox" data-field="drain" class="peer sr-only">
                                <div class="w-10 h-6 bg-slate-200 rounded-full peer-checked:bg-blue-500 transition-all"></div>
                                <div class="absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-all peer-checked:translate-x-4"></div>
                            </div>
                            <span class="ml-3 text-sm font-bold text-slate-700 group-hover:text-blue-600 transition-colors">排水確認</span>
                        </label>
                    </div>`;
                }

                card.innerHTML = `<div class="border-b border-slate-100 pb-3 mb-2"><h3 class="font-bold text-lg text-slate-800 flex items-center gap-2"><i class="fas fa-cube text-blue-400"></i> ${item.name}</h3><p class="text-xs text-slate-400 font-mono mt-1 pl-7">${modelInfo}</p></div>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 items-start">
                        <div class="lg:col-span-3"><label class="block text-xs font-bold text-slate-400 uppercase mb-1">適温範囲</label><div class="bg-slate-100 text-slate-600 font-mono rounded-xl p-3 text-center">${tempRange}</div></div>
                        <div class="lg:col-span-3"><label class="block text-xs font-bold text-slate-400 uppercase mb-1">検温結果 (℃)</label>${tempDropdownHTML}</div>
                        <div class="lg:col-span-2 flex justify-center">${drainCheckboxHTML}</div>
                        <div class="lg:col-span-2"><label class="block text-xs font-bold text-slate-400 uppercase mb-1">連絡先</label>${createDropdown(["未連絡（自己責任対応）", "クルー", "リーダー", "メンテナンスセンター", "クルーとメンテナンスセンター", "リーダーとメンテナンスセンター", "店長", "本部社員OFC", "オーナー"]).outerHTML}</div>
                        <div class="lg:col-span-2"><label class="block text-xs font-bold text-slate-400 uppercase mb-1">処置</label>${createDropdown(["連絡待ち", "処置済", "経過観察"]).outerHTML}</div>
                    </div>`;
                
                if(hasTempRange) card.querySelector('select').dataset.field = 'temperature';
                card.querySelector('.lg\\:col-span-2:nth-last-child(2) select').dataset.field = 'contact';
                card.querySelector('.lg\\:col-span-2:last-child select').dataset.field = 'action';
                container.appendChild(card);
                
                // (イベントリスナー追加部分はロジック同じ)
                if(hasTempRange){
                    const tempSelect = card.querySelector('[data-field="temperature"]');
                    tempSelect?.addEventListener('change', (e) => {
                        const value = parseFloat(e.target.value);
                        const isOutOfRange = value < temp_min || value > temp_max;
                        e.target.classList.toggle('bg-rose-50', isOutOfRange);
                        e.target.classList.toggle('border-rose-300', isOutOfRange);
                        e.target.classList.toggle('text-rose-600', isOutOfRange);
                        if (isOutOfRange) showWarningAlert("適温でない場合は必ず上長、もしくはメンテナンスセンター(0120-190-711)に連絡願います。\nメンテナンスセンターに連絡するときには、必ず店番と異常什器の型番、症状などを落ち着いて伝えてください");
                    });
                }

                card.querySelector('[data-field="contact"]')?.addEventListener('change', (e) => {
                    const isSelfResponsibility = e.target.value === "未連絡（自己責任対応）";
                    e.target.classList.toggle('bg-rose-50', isSelfResponsibility);
                    e.target.classList.toggle('border-rose-300', isSelfResponsibility);
                    e.target.classList.toggle('text-rose-600', isSelfResponsibility);
                    if(isSelfResponsibility) showWarningAlert("自己責任対応の場合、この異常が原因で被害が広がった場合には、自己責任で対応するつもりでお願いします");
                });
            });
             // (ハイライト処理)
             // ↑共通関数化するか、既存の個別のロジックをここに展開する (以下展開)
             if (highlightInfo && highlightInfo.equipmentId) {
                const targetCard = container.querySelector(`[data-equipment-id="${highlightInfo.equipmentId}"]`);
                if(targetCard && highlightInfo.field) {
                    const elementToHighlight = targetCard.querySelector(`[data-field="${highlightInfo.field}"]`);
                    if (elementToHighlight) {
                        const parentDiv = elementToHighlight.closest('div');
                        parentDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        parentDiv.classList.add('highlight-item');
                        elementToHighlight.focus();
                        setTimeout(() => parentDiv.classList.remove('highlight-item'), 2500);
                    }
                }
            }
        }
        
        function renderHaccpCheckView(highlightInfo = null) {
            const container = document.getElementById('checklist-container');
            if(!container) return;
            container.innerHTML = '';
            
            const sortedStaff = getSortedStaff();
            const haccpOrder = storeSettings[currentState.store]?.haccpOrder || Object.keys(haccpMaster);

            haccpOrder.forEach(id => {
                const item = haccpMaster[id];
                if (!item) return;

                const card = document.createElement('div');
                card.className = "bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow space-y-4";
                card.dataset.itemId = id;

                card.innerHTML = `
                    <div class="border-b border-slate-100 pb-3 mb-2"><h3 class="font-bold text-lg text-slate-800 flex items-center gap-2"><i class="fas fa-tasks text-emerald-400"></i> ${item.name}</h3></div>
                    <div class="space-y-4">
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-slate-400 uppercase mb-1">作業状況</label>
                                ${createDropdown(['実施', '未実施']).outerHTML}
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-slate-400 uppercase mb-1">作業時間帯</label>
                                ${createDropdown(['早朝', '昼勤', '夕勤', '準深夜', '深夜']).outerHTML}
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-slate-400 uppercase mb-1">実施者</label>
                                ${createDropdown([], true, sortedStaff).outerHTML}
                            </div>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-slate-400 uppercase mb-1">異常時の処置</label>
                                ${createDropdown(["連絡待ち", "処置済", "経過観察"]).outerHTML}
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-slate-400 uppercase mb-1">連絡先</label>
                                ${createDropdown(["クルー","リーダー","メンテナンスセンター"]).outerHTML}
                            </div>
                        </div>
                    </div>
                `;
                
                card.querySelector('.grid > div:nth-child(1) > select').dataset.field = 'status';
                card.querySelector('.grid > div:nth-child(2) > select').dataset.field = 'timeSlot';
                card.querySelector('.grid > div:nth-child(3) > select').dataset.field = 'staff';
                card.querySelector('.grid.sm\\:grid-cols-2 > div:nth-child(1) > select').dataset.field = 'action';
                card.querySelector('.grid.sm\\:grid-cols-2 > div:nth-child(2) > select').dataset.field = 'contact';

                container.appendChild(card);
            });
            
             if (highlightInfo && highlightInfo.itemId) {
                const targetCard = container.querySelector(`[data-item-id="${highlightInfo.itemId}"]`);
                if(targetCard && highlightInfo.field) {
                    const elementToHighlight = targetCard.querySelector(`[data-field="${highlightInfo.field}"]`);
                     if (elementToHighlight) {
                        const parentDiv = elementToHighlight.closest('div');
                        parentDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        parentDiv.classList.add('highlight-item');
                        elementToHighlight.focus();
                        setTimeout(() => parentDiv.classList.remove('highlight-item'), 2500);
                    }
                }
            }
        }
        
        function renderToiletCheckView(highlightInfo = null) {
            const container = document.getElementById('checklist-container');
            if(!container) return;
            container.innerHTML = '';
            const createToiletSection = (sectionName, orderType) => {
                const card = document.createElement('div');
                card.className = "bg-slate-50 border border-slate-200 rounded-2xl p-1 shadow-sm overflow-hidden"; // テーブルコンテナ風
                card.dataset.section = sectionName;
                const header = `<div class="bg-slate-100 p-4 border-b border-slate-200"><h3 class="font-bold text-lg text-slate-700 flex items-center gap-2"><i class="fas fa-toilet text-sky-400"></i> ${sectionName}</h3></div>`;

                const customOrder = storeSettings[currentState.store]?.[orderType] || [];
                const tasksToShow = customOrder.map(id => ({ id, ...toiletMaster[id] })).filter(task => task.name);
                
                if (tasksToShow.length === 0) {
                     const emptyCard = document.createElement('div');
                     emptyCard.className = "bg-white border border-slate-200 rounded-2xl p-6 text-center text-slate-400";
                     emptyCard.innerHTML = `<h3 class="font-bold text-lg text-slate-600 mb-2">${sectionName}</h3><p>表示項目が未設定です。「並び順を設定」から追加してください。</p>`;
                     return emptyCard;
                }

                const tableContainer = document.createElement('div');
                tableContainer.className = "overflow-x-auto bg-white rounded-b-2xl";
                tableContainer.innerHTML = `${header}<table class="w-full text-center">
                    <thead class="text-xs text-slate-500 uppercase bg-slate-50/50 border-b border-slate-100"><tr>${tasksToShow.map(task => `<th class="px-4 py-4 font-bold min-w-[80px]">${task.name || 'N/A'}</th>`).join('')}</tr></thead>
                    <tbody><tr class="bg-white hover:bg-slate-50 transition-colors">${tasksToShow.map(task => `<td class="p-4 border-r border-slate-50 last:border-0"><input type="checkbox" data-task-id="${task.id}" class="w-6 h-6 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 mx-auto transition-all cursor-pointer hover:scale-110"></td>`).join('')}</tr></tbody>
                </table>`;
                card.appendChild(tableContainer);
                return card;
            };
            container.appendChild(createToiletSection('個室大', 'toiletLargeStallOrder'));
            container.appendChild(createToiletSection('個室小', 'toiletSmallStallOrder'));

             if (highlightInfo && highlightInfo.section) {
                const targetCard = container.querySelector(`[data-section="${highlightInfo.section}"]`);
                if(targetCard && highlightInfo.taskId) {
                    const elementToHighlight = targetCard.querySelector(`[data-task-id="${highlightInfo.taskId}"]`);
                     if (elementToHighlight) {
                        const parentTd = elementToHighlight.closest('td');
                        parentTd.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        parentTd.classList.add('highlight-item');
                        elementToHighlight.focus();
                        setTimeout(() => parentTd.classList.remove('highlight-item'), 2500);
                    }
                }
            }
        }

        function renderHandoverCheckView(highlightInfo = null) {
            const container = document.getElementById('checklist-container');
            if(!container) return;
            container.innerHTML = '';
            
            const createHandoverSection = (sectionName, orderType) => {
                const card = document.createElement('div');
                card.className = "bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow space-y-6 handover-section";
                card.dataset.orderType = orderType;
                card.innerHTML = `<div class="border-b border-slate-100 pb-3"><h3 class="font-bold text-lg text-slate-800 flex items-center gap-2"><i class="fas fa-exchange-alt text-violet-400"></i> ${sectionName}</h3></div>`;

                const infoContainer = document.createElement('div');
                infoContainer.className = 'space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100';
                
                const sortedStaff = getSortedStaff();
                const timeOptions = Array.from({length: 96}, (_, i) => `${String(Math.floor(i/4)).padStart(2,'0')}:${String((i%4)*15).padStart(2,'0')}`);
                
                const staffGrid = document.createElement('div');
                staffGrid.className = 'grid grid-cols-1 sm:grid-cols-2 gap-4';
                staffGrid.innerHTML = `
                    <div>
                        <label class="block text-xs font-bold text-slate-400 uppercase mb-1">時間担当者</label>
                        ${createDropdown([], true, sortedStaff).outerHTML}
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-400 uppercase mb-1">チェック担当者</label>
                        ${createDropdown([], true, sortedStaff).outerHTML}
                    </div>
                `;
                staffGrid.querySelector('div:nth-child(1) select').dataset.field = "timeStaffId";
                staffGrid.querySelector('div:nth-child(2) select').dataset.field = "checkStaffId";
                infoContainer.appendChild(staffGrid);

                const timeStampGrid = document.createElement('div');
                timeStampGrid.className = 'grid grid-cols-1 sm:grid-cols-3 gap-4';
                timeStampGrid.innerHTML = `
                    <div><label class="block text-xs font-bold text-slate-400 uppercase mb-1">開始時間</label>${createDropdown(timeOptions).outerHTML}</div>
                    <div><label class="block text-xs font-bold text-slate-400 uppercase mb-1">終了時間</label>${createDropdown(timeOptions).outerHTML}</div>
                    <div><label class="block text-xs font-bold text-slate-400 uppercase mb-1">印紙枚数</label>${createDropdown(Array.from({length: 11}, (_, i) => i)).outerHTML}</div>`;

                timeStampGrid.querySelector('div:nth-child(1) select').dataset.field = "startTime";
                timeStampGrid.querySelector('div:nth-child(2) select').dataset.field = "endTime";
                const stampSelect = timeStampGrid.querySelector('div:nth-child(3) select');
                stampSelect.dataset.field = "stampCount";
                stampSelect.addEventListener('change', (e) => {
                    const isLow = parseInt(e.target.value, 10) <= 2;
                    e.target.classList.toggle('bg-yellow-50', isLow);
                    e.target.classList.toggle('border-yellow-400', isLow);
                    e.target.classList.toggle('text-yellow-600', isLow);
                });
                infoContainer.appendChild(timeStampGrid);
                card.appendChild(infoContainer);
                
                const customOrder = storeSettings[currentState.store]?.[orderType] || [];
                const tasksToShow = customOrder.map(id => ({ id, ...handoverTaskMaster[id] })).filter(task => task.name);

                if (tasksToShow.length > 0) {
                    const checkGridContainer = document.createElement('div');
                    
                    // レスポンシブグリッドレイアウトに変更
                    let gridHTML = `<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">`;
                    
                    tasksToShow.forEach(task => {
                        gridHTML += `
                        <label class="group flex flex-col items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-violet-50 hover:border-violet-200 hover:shadow-sm transition-all h-full relative overflow-hidden">
                            <span class="text-xs font-bold text-slate-600 text-center mb-2 leading-tight break-words w-full group-hover:text-violet-700 z-10">${task.name || 'N/A'}</span>
                            <div class="relative z-10">
                                <input type="checkbox" data-task-id="${task.id}" class="peer w-6 h-6 text-violet-600 bg-white border-slate-300 rounded focus:ring-violet-500 transition-all cursor-pointer">
                            </div>
                            <div class="absolute inset-0 bg-violet-100 opacity-0 peer-checked:opacity-20 transition-opacity"></div>
                        </label>`;
                    });
                    
                    gridHTML += '</div>';
                    checkGridContainer.innerHTML = gridHTML;
                    card.appendChild(checkGridContainer);
                } else {
                     card.innerHTML += '<p class="text-slate-400 text-sm p-4 border border-dashed border-slate-300 rounded-xl text-center">表示項目が未設定です</p>';
                }

                const saveButtonContainer = document.createElement('div');
                saveButtonContainer.className = 'mt-2 flex justify-end';
                saveButtonContainer.innerHTML = `<button class="bg-violet-600 hover:bg-violet-500 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-violet-500/30 transition-all transform active:scale-95 flex items-center gap-2"><i class="fas fa-save"></i> ${sectionName}の情報を保存</button>`;
                saveButtonContainer.querySelector('button').addEventListener('click', handleHandoverSave);
                card.appendChild(saveButtonContainer);
                
                return card;
            };

            container.appendChild(createHandoverSection('1レジ', 'handover1Order'));
            container.appendChild(createHandoverSection('2レジ', 'handover2Order'));
            
            // (ハイライト処理も同様に適用)
            if (highlightInfo && highlightInfo.orderType) {
                const targetSection = container.querySelector(`.handover-section[data-order-type="${highlightInfo.orderType}"]`);
                if (!targetSection) return;

                let elementToHighlight = null;

                if (highlightInfo.taskId) {
                    elementToHighlight = targetSection.querySelector(`input[data-task-id="${highlightInfo.taskId}"]`);
                } else if (highlightInfo.field) {
                    elementToHighlight = targetSection.querySelector(`[data-field="${highlightInfo.field}"]`);
                }

                if (elementToHighlight) {
                    const parentDiv = elementToHighlight.closest('div');
                    parentDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    parentDiv.classList.add('highlight-item');
                    elementToHighlight.focus();
                    setTimeout(() => parentDiv.classList.remove('highlight-item'), 2500);
                }
            }
        }

        // --- ダッシュボード関連の関数 ---
        function renderDashboardView() {
            const dashboardView = document.getElementById('dashboard-view');
            const mainAppView = document.getElementById('main-app-view');
            const checklistView = document.getElementById('checklist-view');
            mainAppView.style.display = 'none'; 
            dashboardView.style.display = 'block';
            checklistView.style.display = 'none';

            const today = new Date().toISOString().slice(0, 10);

            dashboardView.innerHTML = `
                <div class="bg-white rounded-3xl shadow-xl border border-slate-100 p-6 sm:p-8">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 border-b border-slate-100 pb-6 gap-4">
                        <button class="back-to-main text-slate-500 hover:text-blue-600 font-medium transition-colors flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-blue-50">
                            <i class="fas fa-arrow-left"></i> 戻る
                        </button>
                        <div class="text-center flex-grow">
                             <div class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">${currentState.storeName}</div>
                             <h1 class="text-2xl sm:text-3xl font-black text-slate-800">ダッシュボード</h1>
                        </div>
                        <div class="w-full sm:w-auto">
                            <label for="dashboard-date" class="block text-xs font-bold text-slate-400 uppercase mb-1">日付選択</label>
                            <input type="date" id="dashboard-date" value="${today}" class="block w-full sm:w-auto bg-slate-50 border border-slate-200 text-slate-700 rounded-xl p-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer font-medium">
                        </div>
                    </div>
                    <div id="dashboard-content" class="space-y-8 animate-fade-in">
                         <div class="text-center p-12"><div class="loader mx-auto mb-4"></div><p class="text-slate-400 font-medium">データを分析中...</p></div>
                    </div>
                </div>`;
            
            document.querySelector('#dashboard-view .back-to-main').addEventListener('click', backToMainView);
            document.getElementById('dashboard-date').addEventListener('change', (e) => {
                const selectedDate = new Date(e.target.value);
                updateDashboard(selectedDate);
            });

            updateDashboard(new Date());
        }

        async function updateDashboard(date) {
             // (ロジック変更なし、HTML生成部分のみデザイン変更)
            const contentEl = document.getElementById('dashboard-content');
            contentEl.innerHTML = `<div class="text-center p-12"><div class="loader mx-auto mb-4"></div><p class="text-slate-400 font-medium">データを分析中...</p></div>`;
            
            const logData = await fetchDashboardData(date);
            
            let summaryHTML = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
            let issuesHTML = '';

            const tempSummary = processTempLogs(logData.temperature);
            summaryHTML += createSummaryCard('温度チェック', 'fa-thermometer-half', 'rose', tempSummary.total, tempSummary.issueCount);
            if (tempSummary.issues.length > 0) issuesHTML += createIssueCard('温度チェック', 'fa-thermometer-half', 'rose', tempSummary.issues);

            const haccpSummary = processHaccpLogs(logData.haccp);
            summaryHTML += createSummaryCard('HACCPチェック', 'fa-clipboard-check', 'emerald', haccpSummary.total, haccpSummary.issueCount);
            if (haccpSummary.issues.length > 0) issuesHTML += createIssueCard('HACCPチェック', 'fa-clipboard-check', 'emerald', haccpSummary.issues);
            
            const toiletSummary = processToiletLogs(logData.toilet_cleaning);
            summaryHTML += createSummaryCard('トイレ掃除', 'fa-restroom', 'sky', toiletSummary.total, toiletSummary.issueCount);
            if (toiletSummary.issues.length > 0) issuesHTML += createIssueCard('トイレ掃除', 'fa-restroom', 'sky', toiletSummary.issues);
            
            const handoverSummary = processHandoverLogs(logData.handover);
            summaryHTML += createSummaryCard('引き継ぎチェック', 'fa-people-arrows', 'violet', handoverSummary.total, handoverSummary.issueCount);
            if (handoverSummary.issues.length > 0) issuesHTML += createIssueCard('引き継ぎチェック', 'fa-people-arrows', 'violet', handoverSummary.issues);

            summaryHTML += '</div>';

            if(issuesHTML) {
                issuesHTML = `<div class="mt-8"><h3 class="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><i class="fas fa-exclamation-circle text-rose-500"></i> 要確認項目</h3><div class="space-y-4">${issuesHTML}</div></div>`;
            } else {
                 issuesHTML = `<div class="mt-8 text-center p-8 bg-emerald-50 rounded-2xl border border-emerald-100"><div class="w-16 h-16 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center text-3xl mx-auto mb-4"><i class="fas fa-check"></i></div><p class="text-emerald-800 font-bold text-lg">Excellent!</p><p class="text-emerald-600">この日の記録に問題は見つかりませんでした。</p></div>`;
            }

            contentEl.innerHTML = summaryHTML + issuesHTML;

            contentEl.querySelectorAll('.issue-link').forEach(link => {
                link.addEventListener('click', handleIssueLinkClick);
            });
            contentEl.querySelectorAll('.history-detail-link').forEach(link => {
                link.addEventListener('click', handleHistoryLinkClick);
            });
        }
        
        // (fetchDashboardData, processTempLogs などのデータ処理ロジックは変更なし)
         async function fetchDashboardData(date) {
            const dateStr = date.toISOString().slice(0, 10);
            const storeId = currentState.store;
            const categoryMap = {
                'temperature': `${dbBasePath}/logs/temperature/${storeId}/${dateStr}/entries`,
                'haccp': `${dbBasePath}/logs/haccp/${storeId}/${dateStr}/entries`,
                'toilet_cleaning': `${dbBasePath}/logs/toilet_cleaning/${storeId}/${dateStr}/entries`,
            };

            const promises = Object.entries(categoryMap).map(async ([key, path]) => {
                const snapshot = await getDocs(query(collection(db, path))).catch(() => ({ docs: [] }));
                return { [key]: snapshot.docs.map(d => ({...d.data(), id: d.id})) };
            });

            const handoverPath1 = `${dbBasePath}/logs/handover/${storeId}/${dateStr}/handover1Order`;
            const handoverPath2 = `${dbBasePath}/logs/handover/${storeId}/${dateStr}/handover2Order`;
            const handoverPromise = Promise.all([
                getDocs(collection(db, handoverPath1)).catch(() => ({ docs: [] })),
                getDocs(collection(db, handoverPath2)).catch(() => ({ docs: [] })),
            ]).then(([snap1, snap2]) => {
                const logs1 = snap1.docs.map(d => ({ ...d.data(), id: d.id, orderType: 'handover1Order' }));
                const logs2 = snap2.docs.map(d => ({ ...d.data(), id: d.id, orderType: 'handover2Order' }));
                return { handover: [...logs1, ...logs2] };
            });

            promises.push(handoverPromise);
            
            const results = await Promise.all(promises);
            return Object.assign({}, ...results);
        }
        
        function processTempLogs(logs) {
             // (ロジック変更なし)
            let issueCount = 0;
            const issues = [];
            if (!logs || logs.length === 0) return { total: 0, issueCount: 0, issues: [] };
            const latestLog = logs.sort((a,b) => b.createdAt.toMillis() - a.createdAt.toMillis())[0];
            latestLog.data.checks.forEach(check => {
                const itemInfo = equipmentMaster[check.equipmentId];
                if (!itemInfo) return;
                const temp_min = parseFloat(itemInfo.temp_min);
                const temp_max = parseFloat(itemInfo.temp_max);
                const tempValue = parseFloat(check.temperature);
                if (!isNaN(tempValue) && (!isNaN(temp_min) && !isNaN(temp_max)) && (tempValue < temp_min || tempValue > temp_max)) {
                    issueCount++;
                    issues.push({ text: `「${itemInfo.name}」が適温外 (${tempValue}℃)`, category: '温度チェック', equipmentId: check.equipmentId, field: 'temperature', log: latestLog });
                }
                 if (check.drainChecked === false) {
                    issueCount++;
                    issues.push({ text: `「${itemInfo.name}」の排水が未実施`, category: '温度チェック', equipmentId: check.equipmentId, field: 'drain', log: latestLog });
                }
            });
            return { total: logs.length, issueCount, issues };
        }
        // (processHaccpLogs, processToiletLogs, processHandoverLogs も同様にロジック維持)
        function processHaccpLogs(logs) {
            let issueCount = 0;
            const issues = [];
             if (!logs || logs.length === 0) return { total: 0, issueCount: 0, issues: [] };
            const latestLog = logs.sort((a,b) => b.createdAt.toMillis() - a.createdAt.toMillis())[0];
            latestLog.data.checks.forEach(check => {
                if (check.status === '未実施') {
                    const itemName = haccpMaster[check.itemId]?.name || '不明な項目';
                    issueCount++;
                    issues.push({ text: `「${itemName}」が未実施`, category: 'HACCPチェック', itemId: check.itemId, field: 'status', log: latestLog });
                }
            });
            return { total: logs.length, issueCount, issues };
        }
        function processToiletLogs(logs) {
            let issueCount = 0;
            const issues = [];
            if (!logs || logs.length === 0) return { total: 0, issueCount: 0, issues: [] };
            const latestLog = logs.sort((a,b) => b.createdAt.toMillis() - a.createdAt.toMillis())[0];
            Object.entries(latestLog.data.checks).forEach(([section, tasks]) => {
                 Object.entries(tasks).forEach(([taskId, isChecked]) => {
                    if (!isChecked) {
                        const taskName = toiletMaster[taskId]?.name || '不明な項目';
                        issueCount++;
                        issues.push({ text: `トイレ掃除 (${section}) の「${taskName}」が未チェック`, category: 'トイレ掃除', section: section, taskId: taskId, log: latestLog });
                    }
                 });
            });
            return { total: logs.length, issueCount, issues };
        }
        function processHandoverLogs(logs) {
            let issueCount = 0;
            const issues = [];
            if (!logs || logs.length === 0) return { total: 0, issueCount: 0, issues: [] };
            logs.forEach(log => {
                 const logIdentifier = log.orderType === 'handover1Order' ? '1レジ' : '2レジ';
                 if (parseInt(log.stampCount, 10) <= 2) {
                     issueCount++;
                     issues.push({ text: `${logIdentifier} の印紙枚数が少ない (${log.stampCount}枚)`, category: '引き継ぎチェック', orderType: log.orderType, field: 'stampCount', log: log });
                 }
                 Object.entries(log.checkedTasks).forEach(([taskId, isChecked]) => {
                     if(!isChecked) {
                         const taskName = handoverTaskMaster[taskId]?.name || '不明な項目';
                         issueCount++;
                         issues.push({ text: `${logIdentifier} の「${taskName}」が未チェック`, category: '引き継ぎチェック', orderType: log.orderType, taskId: taskId, log: log });
                     }
                 });
            });
            return { total: logs.length, issueCount, issues };
        }

        function createSummaryCard(title, icon, color, total, issueCount) {
             const colors = {
                rose: { bg: 'bg-rose-50', text: 'text-rose-600', iconBg: 'bg-rose-100', icon: 'text-rose-500' },
                emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', iconBg: 'bg-emerald-100', icon: 'text-emerald-500' },
                sky: { bg: 'bg-sky-50', text: 'text-sky-600', iconBg: 'bg-sky-100', icon: 'text-sky-500' },
                violet: { bg: 'bg-violet-50', text: 'text-violet-600', iconBg: 'bg-violet-100', icon: 'text-violet-500' },
             };
             const c = colors[color];
            
            return `
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between h-32 hover:shadow-md transition-shadow relative overflow-hidden group">
                    <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110">
                        <i class="fas ${icon} text-6xl ${c.text}"></i>
                    </div>
                    <div class="flex justify-between items-start relative z-10">
                        <div>
                            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">${title}</p>
                            <p class="text-2xl font-black text-slate-800 mt-1">${total > 0 ? total + '<span class="text-sm font-medium text-slate-500 ml-1">回</span>' : '<span class="text-slate-300">--</span>'}</p>
                        </div>
                        <div class="w-10 h-10 rounded-xl ${c.iconBg} flex items-center justify-center ${c.icon}">
                            <i class="fas ${icon}"></i>
                        </div>
                    </div>
                    <div class="relative z-10">
                         ${total > 0 ? 
                           (issueCount > 0 ? `<div class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 text-rose-600 text-xs font-bold"><i class="fas fa-exclamation-triangle"></i> ${issueCount}件の要確認</div>` : `<div class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-bold"><i class="fas fa-check"></i> 問題なし</div>`)
                           : `<div class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-slate-400 text-xs font-bold">未実施</div>`
                         }
                    </div>
                </div>`;
        }
        
        function createIssueCard(title, icon, color, issues) {
             const borderColors = {
                rose: 'border-rose-500', emerald: 'border-emerald-500', sky: 'border-sky-500', violet: 'border-violet-500'
            };
            const textColors = {
                rose: 'text-rose-600', emerald: 'text-emerald-600', sky: 'text-sky-600', violet: 'text-violet-600'
            };

            const issueItemsHTML = issues.map(issue => {
                const time = issue.log?.createdAt?.toDate().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) || '--:--';
                 // 修正ボタンと履歴ボタンを並べる
                return `
                    <li class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-slate-300 transition-colors">
                        <div class="flex items-start gap-3">
                            <span class="text-rose-500 mt-1 flex-shrink-0"><i class="fas fa-exclamation-circle"></i></span>
                            <span class="font-medium text-slate-700 text-sm">${issue.text}</span>
                        </div>
                        <div class="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
                            <span class="text-xs font-mono text-slate-400 mr-2">${time}</span>
                            <button class="history-detail-link px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-100 transition-colors shadow-sm"
                                    data-category='${issue.category}'
                                    data-log='${JSON.stringify(issue.log)}'>
                                <i class="fas fa-history mr-1"></i> 履歴
                            </button>
                            <button class="issue-link px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm shadow-blue-500/30"
                                    data-category="${issue.category}"
                                    data-order-type="${issue.orderType || ''}"
                                    data-task-id="${issue.taskId || ''}"
                                    data-field="${issue.field || ''}"
                                    data-equipment-id="${issue.equipmentId || ''}"
                                    data-item-id="${issue.itemId || ''}"
                                    data-section="${issue.section || ''}">
                                <i class="fas fa-pen mr-1"></i> 修正
                            </button>
                        </div>
                    </li>`;
            }).join('');

            return `
                <div class="bg-white p-6 rounded-2xl shadow-sm border-l-4 ${borderColors[color]} border-t border-r border-b border-slate-100">
                    <h4 class="font-bold text-slate-800 mb-4 flex items-center"><i class="fas ${icon} mr-2 ${textColors[color]}"></i>${title}</h4>
                    <ul class="space-y-2">
                        ${issueItemsHTML}
                    </ul>
                </div>`;
        }
        
        // (Link Click Handlers もロジック変更なし)
        function handleIssueLinkClick(event) {
            const target = event.currentTarget;
            const { category, orderType, taskId, field, equipmentId, itemId, section } = target.dataset;
            if (!category) return;
            const highlightInfo = { orderType, taskId, field, equipmentId, itemId, section };
            currentState.category = category;
            renderChecklistView(category, highlightInfo);
        }

        function handleHistoryLinkClick(event) {
            const target = event.currentTarget;
            const { category, log } = target.dataset;
            if (!category || !log) return;
            try {
                const parsedLog = JSON.parse(log);
                if (parsedLog.createdAt && typeof parsedLog.createdAt.seconds === 'number') {
                    const date = new Date(parsedLog.createdAt.seconds * 1000 + (parsedLog.createdAt.nanoseconds || 0) / 1000000);
                    parsedLog.createdAt = { toDate: () => date, toMillis: () => date.getTime() };
                }
                currentState.category = category;
                showHistoryDetail(parsedLog);
            } catch(e) {
                console.error("Failed to parse log data:", e);
                showAppAlert("履歴詳細の表示に失敗しました。", false);
            }
        }
        
        initializeApplication();

    </script>
</body>
</html>
