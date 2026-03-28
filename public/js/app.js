        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import {
            initializeFirestore,
            getFirestore,
            persistentLocalCache,
            persistentMultipleTabManager,
            doc,
            setDoc,
            collection,
            getDocs,
            addDoc,
            serverTimestamp,
            query,
            orderBy,
            limit,
            collectionGroup,
            where,
            Timestamp,
        } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

        // --- グローバル変数定義 ---
        let app, auth, db; // Firebaseインスタンス
        const dbBasePath = 'artifacts/general-master-data/public/data';

        /** 指定日のログ直下パス: .../logs/{category}/{storeId}/{yyyy-mm-dd} */
        function logDayPath(logCategory, storeId, dateStr) {
            return `${dbBasePath}/logs/${logCategory}/${storeId}/${dateStr}`;
        }
        /** 温度・HACCP・トイレなど entries サブコレクションのパス */
        function logEntriesPath(logCategory, storeId, dateStr) {
            return `${logDayPath(logCategory, storeId, dateStr)}/entries`;
        }
        /** 引き継ぎ: 日付直下の handover1Order / handover2Order コレクション */
        function handoverOrderPath(storeId, dateStr, orderType) {
            return `${logDayPath('handover', storeId, dateStr)}/${orderType}`;
        }

        /** 業務日の切替時刻（未満は前日扱い）。24時間店向け。 */
        const BUSINESS_DAY_START_HOUR = 5;

        function formatLocalYMD(d) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }

        /** 端末ローカル時刻での業務日 YYYY-MM-DD（例: 未明4時は「前日」のチェックとして保存） */
        function getBusinessDateString(now = new Date()) {
            const d = new Date(now.getTime());
            if (d.getHours() < BUSINESS_DAY_START_HOUR) {
                d.setDate(d.getDate() - 1);
            }
            return formatLocalYMD(d);
        }

        let storesMaster = {}, staffMaster = {}, equipmentMaster = {}, storeSettings = {};
        let haccpMaster = {}, toiletMaster = {}, handoverTaskMaster = {};
        let currentState = { store: '', storeName: '', staff: '', staffName: '', category: '', orderType: '' };
        let appMetaCache = null;

        function escapeHtml(s) {
            if (s == null) return '';
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        async function loadAppMetaAndBindUi() {
            const btn = document.getElementById('version-info-btn');
            const modal = document.getElementById('version-modal');
            const modalBody = document.getElementById('version-modal-body');
            const modalClose = document.getElementById('version-modal-close');
            if (!btn || !modal || !modalBody || !modalClose) return;

            try {
                const res = await fetch(`/app-meta.json?cb=${Date.now()}`, { cache: 'no-store' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                appMetaCache = await res.json();
                btn.textContent = `v${appMetaCache.version} · リリース履歴`;
                btn.classList.remove('hig-text-destructive');
            } catch (e) {
                btn.textContent = 'アプリ情報を取得できませんでした';
                btn.classList.add('hig-text-destructive');
                console.warn('app-meta load failed', e);
            }

            function renderModalBody() {
                if (!appMetaCache) {
                    modalBody.innerHTML = '<p class="text-red-600">app-meta.json を読み込めませんでした。</p>';
                    return;
                }
                const rows = (appMetaCache.deployments || []).map((d) => {
                    const ok = d.success !== false;
                    const badge = ok
                        ? '<span class="text-green-700 bg-green-100 px-2 py-0.5 rounded text-xs">成功</span>'
                        : '<span class="text-red-700 bg-red-100 px-2 py-0.5 rounded text-xs">失敗</span>';
                    const when = d.deployedAt ? new Date(d.deployedAt).toLocaleString('ja-JP') : '—';
                    const err = !ok && d.error
                        ? `<pre class="mt-2 text-xs text-red-800 whitespace-pre-wrap break-all bg-red-50 p-2 rounded max-h-36 overflow-y-auto">${escapeHtml(d.error)}</pre>`
                        : '';
                    return `<li class="border-b border-gray-100 py-3">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="font-mono font-semibold">v${escapeHtml(String(d.version))}</span>
                            ${badge}
                        </div>
                        <p class="text-xs text-gray-500 mt-1">${escapeHtml(when)} · ${escapeHtml(d.deployedBy || '—')}</p>
                        ${err}
                    </li>`;
                }).join('');
                modalBody.innerHTML = `
                    <p class="mb-3 text-gray-600">現在のバージョン: <strong class="font-mono">v${escapeHtml(appMetaCache.version)}</strong></p>
                    <p class="text-xs text-gray-500 mb-3">デプロイのたびに記録されます（失敗した試行も version・担当者・エラー内容が残ります）。</p>
                    <ul class="list-none p-0 m-0">${rows || '<li class="text-gray-500 py-2">履歴はまだありません。</li>'}</ul>
                `;
            }

            function openModal() {
                renderModalBody();
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }
            function closeModal() {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }

            btn.addEventListener('click', openModal);
            modalClose.addEventListener('click', closeModal);
            modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
            });
        }
        
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
                if (!window._tenpoDraftPagehideBound) {
                    window._tenpoDraftPagehideBound = true;
                    window.addEventListener('pagehide', flushDraftSaveSync);
                }
                showLoading(false);
                await loadAppMetaAndBindUi();
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
            // IndexedDB によるオフライン永続化（読み書きをローカルにキャッシュ、回線復帰後に同期）
            // マルチタブ同期あり：店舗端末で複数タブを開いても failed-precondition になりにくい
            try {
                db = initializeFirestore(app, {
                    localCache: persistentLocalCache({
                        tabManager: persistentMultipleTabManager(),
                    }),
                });
            } catch (e) {
                console.warn('Firestore オフライン永続化の初期化に失敗。オンラインのみで続行します:', e);
                db = getFirestore(app);
            }
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
                const masterPaths = {
                    stores: `${dbBasePath}/stores`,
                    equipment: `${dbBasePath}/fixtures`,
                    settings: `${dbBasePath}/storeSettings`,
                    haccp: `${dbBasePath}/haccp`,
                    toilet: `${dbBasePath}/toilet_cleaning`,
                    handover: `${dbBasePath}/handovers`,
                    staff: `${dbBasePath}/employees`
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
            document.getElementById('loading-text').textContent = text;
            loadingOverlay.style.display = isLoading ? 'flex' : 'none';
            appContainer.style.display = isLoading ? 'none' : 'block';
        }

        function showStep(step) {
            document.getElementById('step-1').style.display = (step === 1) ? 'block' : 'none';
            document.getElementById('step-2').style.display = (step === 2) ? 'block' : 'none';
        }
        
        function createModal(id, title, content, buttons) {
            const existingModal = document.getElementById(id);
            if(existingModal) existingModal.remove();

            const modal = document.createElement('div');
            modal.id = id;
            modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 hig-modal-backdrop';
            
            let buttonHTML = '';
            buttons.forEach(btn => {
                buttonHTML += `<button type="button" id="${btn.id}" class="${btn.classes}">${btn.text}</button>`;
            });

            modal.innerHTML = `
                <div class="relative w-full max-w-3xl max-h-[90vh] flex flex-col hig-modal-panel bg-white">
                    <div class="px-5 pt-4 pb-3 border-b border-black/10 shrink-0">
                        <h3 class="text-[17px] font-semibold text-black text-center leading-snug">${title}</h3>
                    </div>
                    <div class="px-4 py-4 overflow-y-auto flex-1 min-h-0 space-y-4">${content}</div>
                    <div class="hig-modal-footer items-center px-4 py-3 flex justify-end gap-2 flex-wrap shrink-0">
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
            renderFunctions[category]?.(highlightInfo);

            if (category === '温度チェック' || category === 'HACCPチェック') {
                restoreChecklistDraft();
                attachChecklistDraftListeners();
            }
        }

        function backToMainView() {
            document.getElementById('checklist-view').style.display = 'none';
            document.getElementById('dashboard-view').style.display = 'none';
            document.getElementById('main-app-view').style.display = 'block';
            updateCategoryStatus();
            showStep(2);
        }

        function createChecklistViewHTML(title) {
             const layout = `<div id="checklist-container" class="space-y-4"></div>`;
            
             return `<div class="hig-card p-4 sm:p-6">
                    <div class="mb-6 border-b border-black/10 pb-4">
                        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <button type="button" class="back-to-main hig-link-back shrink-0"><i class="fas fa-chevron-left mr-2"></i>カテゴリ選択に戻る</button>
                            <h1 class="hig-title-medium text-center flex-grow order-first sm:order-none">${currentState.storeName}<br><span class="text-[17px] font-semibold text-black/70">${title}</span></h1>
                            <div class="flex flex-wrap gap-2 justify-end w-full sm:w-auto">
                              <button type="button" id="show-history-btn" class="hig-btn-tint-green"><i class="fas fa-calendar-alt mr-2"></i>履歴</button>
                              <button type="button" class="open-order-settings-btn hig-btn-tint-violet"><i class="fas fa-sort mr-2"></i>並び順を設定</button>
                            </div>
                        </div>
                        <p class="text-center hig-footnote mt-3">記録・参照の営業日: <strong class="text-black/80">${getBusinessDateString()}</strong>（朝${BUSINESS_DAY_START_HOUR}:00 切替・端末の時刻基準）</p>
                    </div>
                    ${layout}
                    <div id="global-save-container" class="mt-6 flex justify-end items-center gap-3">
                        <button type="button" id="save-log-btn" class="hig-btn-primary px-8"><i class="fas fa-save mr-2"></i>保存する</button>
                    </div>
                    <div class="mt-8 border-t border-black/10 pt-6">
                        <button type="button" class="back-to-main hig-link-back"><i class="fas fa-chevron-left mr-2"></i>カテゴリ選択に戻る</button>
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

        /** 冷凍庫向け: 適温上限が 0℃ 以下のとき霜取り表示 DF を選べる */
        function isFreezerTempRange(temp_min, temp_max) {
            return !isNaN(temp_min) && !isNaN(temp_max) && temp_max <= 0;
        }

        function createDropdown(options, isObject = false, data = {}) {
            const select = document.createElement('select');
            select.className = 'hig-field';
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

        async function updateCategoryStatus() {
            const dateStr = getBusinessDateString();
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
                    const storeId = currentState.store;

                    if (logCategory === 'handover') {
                        const [snap1, snap2] = await Promise.all([
                            getDocs(collection(db, handoverOrderPath(storeId, dateStr, 'handover1Order'))),
                            getDocs(collection(db, handoverOrderPath(storeId, dateStr, 'handover2Order'))),
                        ]);
                        const allLogs = [...snap1.docs, ...snap2.docs].map(d => d.data());
                        count = allLogs.length;
                        if (count > 0) {
                            allLogs.sort((a, b) => {
                                const ma = a.createdAt?.toMillis?.() ?? 0;
                                const mb = b.createdAt?.toMillis?.() ?? 0;
                                return mb - ma;
                            });
                            lastLog = allLogs[0];
                        }
                    } else {
                        const logRef = collection(db, logEntriesPath(logCategory, storeId, dateStr));
                        const q = query(logRef, orderBy('createdAt', 'desc'));
                        const snapshot = await getDocs(q);
                        count = snapshot.size;
                        if (!snapshot.empty) lastLog = snapshot.docs[0].data();
                    }

                    if (lastLog && lastLog.createdAt?.toDate) {
                        const staffId = lastLog.checkStaffId || lastLog.staffId || 'unknown';
                        const staffInfo = staffMaster[staffId] || {};
                        const staffName = staffInfo.nickname || `${staffInfo.lastName || ''} ${staffInfo.firstName || ''}`.trim() || '不明';
                        const time = lastLog.createdAt.toDate().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                        statusEl.textContent = `最終更新: ${staffName} ${time} (本日${count}回)`;
                    } else if (count > 0) {
                        statusEl.textContent = `本日${count}回（日時の表示形式が不正です）`;
                    } else {
                        statusEl.textContent = '（本日未実施）';
                    }
                } catch (e) {
                    console.error(`Status update failed for ${categoryName}:`, e);
                    statusEl.textContent = '（情報取得エラー・ネットワークまたは権限を確認）';
                }
            }
        }

        // --- チェックリスト下書き（localStorage）・保存前バリデーション ---
        const DRAFT_STORAGE_PREFIX = 'tenpo-check-draft';
        let draftSaveTimer = null;

        function draftStorageKey() {
            const d = getBusinessDateString();
            return `${DRAFT_STORAGE_PREFIX}:${currentState.store}:${currentState.staff}:${currentState.category}:${d}`;
        }

        function collectTempDraftState() {
            return Array.from(document.querySelectorAll('#checklist-container [data-equipment-id]')).map((card) => ({
                equipmentId: card.dataset.equipmentId,
                temperature: card.querySelector('[data-field="temperature"]')?.value ?? '',
                drainChecked: card.querySelector('[data-field="drain"]')?.checked ?? false,
                contact: card.querySelector('[data-field="contact"]')?.value ?? '',
                action: card.querySelector('[data-field="action"]')?.value ?? '',
            }));
        }

        function collectHaccpDraftState() {
            return Array.from(document.querySelectorAll('#checklist-container [data-item-id]')).map((card) => ({
                itemId: card.dataset.itemId,
                status: card.querySelector('[data-field="status"]')?.value ?? '',
                timeSlot: card.querySelector('[data-field="timeSlot"]')?.value ?? '',
                staff: card.querySelector('[data-field="staff"]')?.value ?? '',
                action: card.querySelector('[data-field="action"]')?.value ?? '',
                contact: card.querySelector('[data-field="contact"]')?.value ?? '',
            }));
        }

        function persistDraftPayload(payload) {
            try {
                localStorage.setItem(draftStorageKey(), JSON.stringify(payload));
            } catch (e) {
                console.warn('下書き保存に失敗:', e);
            }
        }

        function flushDraftSaveSync() {
            if (!['温度チェック', 'HACCPチェック'].includes(currentState.category)) return;
            if (!document.getElementById('checklist-container')) return;
            clearTimeout(draftSaveTimer);
            if (currentState.category === '温度チェック') {
                persistDraftPayload({ v: 1, kind: 'temp', checks: collectTempDraftState() });
            } else if (currentState.category === 'HACCPチェック') {
                persistDraftPayload({ v: 1, kind: 'haccp', checks: collectHaccpDraftState() });
            }
        }

        function scheduleDraftSave() {
            if (!['温度チェック', 'HACCPチェック'].includes(currentState.category)) return;
            clearTimeout(draftSaveTimer);
            draftSaveTimer = setTimeout(flushDraftSaveSync, 450);
        }

        function attachChecklistDraftListeners() {
            const el = document.getElementById('checklist-container');
            if (!el || el._tenpoDraftBound) return;
            el._tenpoDraftBound = true;
            el.addEventListener('change', scheduleDraftSave);
            el.addEventListener('input', scheduleDraftSave);
        }

        function tempDraftHasAnyValue(checks) {
            return checks.some((r) =>
                (r.temperature && String(r.temperature).trim() !== '') ||
                r.drainChecked ||
                (r.contact && String(r.contact).trim() !== '') ||
                (r.action && String(r.action).trim() !== ''),
            );
        }

        function haccpDraftHasAnyValue(checks) {
            return checks.some((r) =>
                (r.status && r.status.trim() !== '') ||
                (r.timeSlot && r.timeSlot.trim() !== '') ||
                (r.staff && r.staff.trim() !== '') ||
                (r.action && r.action.trim() !== '') ||
                (r.contact && r.contact.trim() !== ''),
            );
        }

        function applyTempDraft(checks) {
            if (!Array.isArray(checks)) return;
            checks.forEach((row) => {
                const card = Array.from(document.querySelectorAll('#checklist-container [data-equipment-id]'))
                    .find((c) => c.dataset.equipmentId === String(row.equipmentId));
                if (!card) return;
                const t = card.querySelector('[data-field="temperature"]');
                if (t && row.temperature) {
                    t.value = row.temperature;
                    t.dispatchEvent(new Event('change', { bubbles: true }));
                }
                const d = card.querySelector('[data-field="drain"]');
                if (d) d.checked = !!row.drainChecked;
                const c = card.querySelector('[data-field="contact"]');
                if (c && row.contact) {
                    c.value = row.contact;
                    c.dispatchEvent(new Event('change', { bubbles: true }));
                }
                const a = card.querySelector('[data-field="action"]');
                if (a && row.action) {
                    a.value = row.action;
                    a.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        }

        function applyHaccpDraft(checks) {
            if (!Array.isArray(checks)) return;
            checks.forEach((row) => {
                const card = Array.from(document.querySelectorAll('#checklist-container [data-item-id]'))
                    .find((c) => c.dataset.itemId === String(row.itemId));
                if (!card) return;
                [['status', row.status], ['timeSlot', row.timeSlot], ['staff', row.staff], ['action', row.action], ['contact', row.contact]].forEach(([field, val]) => {
                    const sel = card.querySelector(`[data-field="${field}"]`);
                    if (sel && val) {
                        sel.value = val;
                        sel.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
            });
        }

        function restoreChecklistDraft() {
            if (!['温度チェック', 'HACCPチェック'].includes(currentState.category)) return;
            let raw;
            try {
                raw = localStorage.getItem(draftStorageKey());
            } catch (e) {
                return;
            }
            if (!raw) return;
            let data;
            try {
                data = JSON.parse(raw);
            } catch {
                return;
            }
            const toastKey = `tenpo-draft-toast:${draftStorageKey()}`;
            if (data.kind === 'temp' && currentState.category === '温度チェック' && Array.isArray(data.checks)) {
                if (!tempDraftHasAnyValue(data.checks)) return;
                applyTempDraft(data.checks);
                if (!sessionStorage.getItem(toastKey)) {
                    sessionStorage.setItem(toastKey, '1');
                    showAppAlert('保存前の入力を復元しました', true);
                }
            } else if (data.kind === 'haccp' && currentState.category === 'HACCPチェック' && Array.isArray(data.checks)) {
                if (!haccpDraftHasAnyValue(data.checks)) return;
                applyHaccpDraft(data.checks);
                if (!sessionStorage.getItem(toastKey)) {
                    sessionStorage.setItem(toastKey, '1');
                    showAppAlert('保存前の入力を復元しました', true);
                }
            }
        }

        function clearChecklistDraft() {
            try {
                localStorage.removeItem(draftStorageKey());
            } catch (e) { /* ignore */ }
        }

        function clearValidationHighlights() {
            document.querySelectorAll('#checklist-container select.validation-field-error').forEach((el) => el.classList.remove('validation-field-error'));
        }

        // --- 保存処理 ---
        function showPostSaveBanner() {
            document.getElementById('post-save-saved-banner')?.remove();
            const container = document.getElementById('checklist-container');
            if (!container?.parentElement) return;
            const banner = document.createElement('div');
            banner.id = 'post-save-saved-banner';
            banner.className = 'mb-3 p-3 rounded-[10px] bg-[rgba(52,199,89,0.12)] border border-[rgba(52,199,89,0.25)] text-[#1d7a36] text-[15px] font-semibold text-center';
            banner.textContent = '保存済み — フォームを初期状態に戻しました。続けて入力する場合はそのまま入力してください。';
            container.parentElement.insertBefore(banner, container);
        }

        function rerenderCurrentChecklistForm() {
            const cat = currentState.category;
            if (cat === '温度チェック') renderTempCheckView();
            else if (cat === 'HACCPチェック') renderHaccpCheckView();
            else if (cat === 'トイレ掃除') renderToiletCheckView();
        }

        async function handleGlobalSave() {
            const dateStr = getBusinessDateString();
            
            const categoryToLogType = { '温度チェック': 'temperature', 'HACCPチェック': 'haccp', 'トイレ掃除': 'toilet_cleaning' };
            const logCategory = categoryToLogType[currentState.category];
            if (!logCategory) return;

            /* 未使用設備などで検温・連絡先・処置が空のまま保存できるようにする（必須チェックは行わない） */
            clearValidationHighlights();

            let checks;
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
                document.querySelectorAll('#checklist-container [data-section]').forEach(card => {
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
            const entriesPath = logEntriesPath(logCategory, currentState.store, dateStr);

            showLoading(true, '保存中...');
            try {
                await addDoc(collection(db, entriesPath), logData);
                clearChecklistDraft();
                clearValidationHighlights();
                showPostSaveBanner();
                rerenderCurrentChecklistForm();
                if (currentState.category === '温度チェック' || currentState.category === 'HACCPチェック') {
                    attachChecklistDraftListeners();
                }
                showAppAlert('保存しました。');
                await updateCategoryStatus();
            } catch (error) {
                console.error("保存に失敗:", error);
                showAppAlert("保存に失敗しました。", false);
            } finally {
                showLoading(false);
            }
        }

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
                timeStaffId, 
                checkStaffId, 
                startTime, 
                endTime, 
                stampCount, 
                checkedTasks, 
                storeId: currentState.store,
                createdAt: serverTimestamp() 
            };
            const dateStr = getBusinessDateString();

            const orderPath = handoverOrderPath(currentState.store, dateStr, orderType);

            showLoading(true, '保存中...');
            try {
                await addDoc(collection(db, orderPath), logData);
                showAppAlert(`${card.querySelector('h3').textContent} の情報を保存しました。`);
                await updateCategoryStatus();
            } catch (error) {
                console.error("引き継ぎ情報の保存に失敗:", error);
                showAppAlert("保存に失敗しました。", false);
            } finally {
                showLoading(false);
            }
        }
        
        // --- 履歴機能 ---
        function showHistory() {
            const date = new Date();
            renderCalendarModal(date);
        }

        function renderCalendarModal(date) {
            const year = date.getFullYear();
            const month = date.getMonth();
            const content = `
                <div class="flex justify-between items-center mb-4">
                    <button type="button" id="prev-month-btn" class="hig-btn-secondary min-w-[44px] px-3 py-2 text-lg leading-none">&lt;</button>
                    <h4 id="calendar-title" class="text-lg font-bold">${year}年 ${month + 1}月</h4>
                    <button type="button" id="next-month-btn" class="hig-btn-secondary min-w-[44px] px-3 py-2 text-lg leading-none">&gt;</button>
                </div>
                <div id="calendar-body" class="grid grid-cols-7 gap-1 text-center"></div>
            `;
            const buttons = [{ id: 'calendar-close-btn', text: '閉じる', classes: 'hig-btn-secondary', onClick: () => hideModal('calendar-modal')}];
            createModal('calendar-modal', `${currentState.category} の履歴`, content, buttons);
            
            document.getElementById('prev-month-btn').addEventListener('click', () => {
                date.setMonth(date.getMonth() - 1);
                renderCalendarModal(date);
            });
            document.getElementById('next-month-btn').addEventListener('click', () => {
                date.setMonth(date.getMonth() + 1);
                renderCalendarModal(date);
            });

            generateCalendar(year, month);
        }

        async function generateCalendar(year, month) {
            const calendarBody = document.getElementById('calendar-body');
            if (!calendarBody) return;
            calendarBody.innerHTML = '<div class="col-span-7"><div class="loader mx-auto"></div></div>'; 

            const days = ['日', '月', '火', '水', '木', '金', '土'];
            calendarBody.innerHTML = days.map(day => `<div class="font-bold text-sm text-gray-600">${day}</div>`).join('');

            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            const firstDayOfWeek = firstDay.getDay();
            const lastDate = lastDay.getDate();

            for (let i = 0; i < firstDayOfWeek; i++) {
                calendarBody.innerHTML += '<div></div>';
            }

            const logs = await fetchLogsForMonth(year, month);
            const logsByDate = {};
            logs.forEach(log => {
                const date = log.createdAt.toDate().getDate();
                if (!logsByDate[date]) {
                    logsByDate[date] = [];
                }
                logsByDate[date].push(log);
            });

            for (let date = 1; date <= lastDate; date++) {
                const dayCell = document.createElement('div');
                dayCell.className = "calendar-day p-2 border rounded-md h-20 flex flex-col";
                
                const dateNum = document.createElement('span');
                dateNum.className = "font-semibold";
                dateNum.textContent = date;
                dayCell.appendChild(dateNum);

                if (logsByDate[date]) {
                    dayCell.classList.add('has-log');
                    const logCount = document.createElement('span');
                    logCount.className = 'mt-auto text-xs font-semibold text-white rounded-full px-2 py-1 self-center';
                    logCount.style.background = 'var(--hig-tint)';
                    logCount.textContent = `${logsByDate[date].length}件`;
                    dayCell.appendChild(logCount);

                    dayCell.addEventListener('click', () => showLogsForDay(new Date(year, month, date), logsByDate[date]));
                }
                calendarBody.appendChild(dayCell);
            }
        }
        
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
            const ordered = [...logs].sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());

            let listContent = ordered.map(log => {
                const staffId = log.checkStaffId || log.staffId || 'unknown';
                const staffInfo = staffMaster[staffId] || {};
                const staffName = staffInfo.nickname || `${staffInfo.lastName || ''} ${staffInfo.firstName || ''}`.trim() || '不明';
                const time = log.createdAt.toDate().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                return `<button type="button" data-log-id="${log.id}" class="history-item-btn hig-history-item">${time} - ${staffName}</button>`;
            }).join('');

            const buttons = [
                { id: 'print-day-history-btn', text: 'この日の履歴をPDF保存', classes: 'hig-btn-primary', onClick: () => printHistory(ordered, date)},
                { id: 'day-logs-close-btn', text: '閉じる', classes: 'hig-btn-secondary', onClick: () => hideModal('day-logs-modal')}
            ];
            createModal('day-logs-modal', `${date.toLocaleDateString('ja-JP')} の履歴`, `<div class="space-y-2">${listContent}</div>`, buttons);

            document.querySelectorAll('.history-item-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const logId = btn.dataset.logId;
                    const logData = ordered.find(log => log.id === logId);
                    showHistoryDetail(logData);
                });
            });
        }


        function generateLogDetailHTML(logData, options = {}) {
            const forPrint = options.forPrint === true;
            const time = logData.createdAt.toDate().toLocaleString('ja-JP');
            
            let detailHTML = `<div class="text-left space-y-4 p-4 border-b">
                <p><strong>記録日時:</strong> ${time}</p>`;
            
            const category = currentState.category;
            
            if (category === '引き継ぎチェック') {
                if (logData.timeStaffId && logData.checkStaffId) {
                    const timeStaffInfo = staffMaster[logData.timeStaffId] || {};
                    const timeStaffName = timeStaffInfo.nickname || `${timeStaffInfo.lastName || ''} ${timeStaffInfo.firstName || ''}`.trim() || '不明';
                    const checkStaffInfo = staffMaster[logData.checkStaffId] || {};
                    const checkStaffName = checkStaffInfo.nickname || `${checkStaffInfo.lastName || ''} ${checkStaffInfo.firstName || ''}`.trim() || '不明';
                    detailHTML += `<p><strong>時間担当者:</strong> ${timeStaffName}</p>
                                   <p><strong>チェック担当者:</strong> ${checkStaffName}</p>`;
                } else {
                    const staffInfo = staffMaster[logData.staffId] || {};
                    const staffName = staffInfo.nickname || `${staffInfo.lastName || ''} ${staffInfo.firstName || ''}`.trim() || '不明';
                    detailHTML += `<p><strong>担当者:</strong> ${staffName}</p>`;
                }
            } else {
                const staffInfo = staffMaster[logData.staffId] || {};
                const staffName = staffInfo.nickname || `${staffInfo.lastName || ''} ${staffInfo.firstName || ''}`.trim() || '不明';
                detailHTML += `<p><strong>担当者:</strong> ${staffName}</p>`;
            }

            detailHTML += `<hr>`;
            
            if (category === '温度チェック') {
                const checks = logData.data.checks || [];
                const tempGridClass = forPrint
                    ? `pdf-temp-grid ${checks.length > 8 ? 'pdf-temp-cols-3' : 'pdf-temp-cols-2'}`
                    : 'flex flex-col space-y-2';
                const cardClass = forPrint ? 'pdf-temp-card' : 'p-2 bg-gray-50 rounded mt-2';
                const warnClass = forPrint ? 'pdf-temp-warn' : 'text-red-500 font-bold';
                detailHTML += `<div class="${tempGridClass}">`;
                checks.forEach(check => {
                    const itemInfo = equipmentMaster[check.equipmentId] || {};
                    const itemName = itemInfo.name || '不明な備品';
                    const temp_min = parseFloat(itemInfo.temp_min);
                    const temp_max = parseFloat(itemInfo.temp_max);
                    const tempValue = parseFloat(check.temperature);
                    let tempDisplay = `<span class="${warnClass}">未入力</span>`;
                    
                    if (check.temperature !== null && check.temperature !== '') {
                        const rawT = String(check.temperature).trim();
                        if (rawT === 'DF') {
                            tempDisplay = 'DF（霜取り中）';
                        } else if (!isNaN(tempValue)) {
                            const tempClass = (!isNaN(temp_min) && !isNaN(temp_max) && tempValue >= temp_min && tempValue <= temp_max) ? '' : warnClass;
                            tempDisplay = tempClass ? `<span class="${tempClass}">${check.temperature} ℃</span>` : `${check.temperature} ℃`;
                        } else {
                            tempDisplay = escapeHtml(rawT);
                        }
                    }

                    const needsDrain = itemInfo.manual_drain === true;
                    const drainLine = needsDrain
                        ? `<p>排水: ${check.drainChecked === true ? '実施' : `<span class="${warnClass}">未実施</span>`}</p>`
                        : '';

                    const nameClass = forPrint ? 'pdf-temp-name' : 'font-semibold break-words';
                    const breakClass = forPrint ? '' : 'break-words';
                    detailHTML += `<div class="${cardClass}">
                        <p class="${nameClass}">${itemName}</p>
                        <p>温度: ${tempDisplay}</p>
                        ${drainLine}
                        <p class="${breakClass}">連絡先: ${check.contact || '未入力'}</p>
                        <p class="${breakClass}">処置: ${check.action || '未入力'}</p>
                    </div>`;
                });
                detailHTML += `</div>`;
            } else if (category === 'HACCPチェック') {
                 detailHTML += `<table class="w-full text-left text-sm mt-2"><thead><tr class="bg-gray-100">
                    <th class="p-2">項目</th><th class="p-2">状況</th><th class="p-2">時間帯</th><th class="p-2">実施者</th>
                 </tr></thead><tbody>`;
                 logData.data.checks.forEach(check => {
                     const itemName = haccpMaster[check.itemId]?.name || '不明な項目';
                     const staff = staffMaster[check.staff] || {};
                     const checkedStaffName = staff.nickname || `${staff.lastName || ''} ${staff.firstName || ''}`.trim() || '不明';
                     const statusClass = check.status === '未実施' ? 'text-red-500 font-bold' : '';
                     detailHTML += `<tr class="border-b">
                        <td class="p-2 font-semibold">${itemName}</td>
                        <td class="p-2 ${statusClass}">${check.status || '未入力'}</td>
                        <td class="p-2">${check.timeSlot || '未入力'}</td>
                        <td class="p-2">${checkedStaffName}</td>
                     </tr>`;
                 });
                 detailHTML += `</tbody></table>`;
            } else if (category === 'トイレ掃除') {
                 for(const section in logData.data.checks) {
                     detailHTML += `<h4 class="font-bold mt-4">${section}</h4><ul class="list-disc list-inside ml-4">`;
                     for(const taskId in logData.data.checks[section]){
                         const taskName = toiletMaster[taskId]?.name || '不明な項目';
                         const isChecked = logData.data.checks[section][taskId];
                         const itemClass = !isChecked ? 'text-red-500' : '';
                         detailHTML += `<li class="${itemClass}">${taskName}: ${isChecked ? '実施済み' : '<span class="font-bold">未実施</span>'}</li>`;
                     }
                     detailHTML += `</ul>`;
                 }
            } else if (category === '引き継ぎチェック') {
                const stampCount = parseInt(logData.stampCount, 10);
                const stampClass = stampCount <= 2 ? 'text-red-500 font-bold' : '';

                detailHTML += `<p><strong>開始:</strong> ${logData.startTime}</p>
                               <p><strong>終了:</strong> ${logData.endTime}</p>
                               <p><strong>印紙:</strong> <span class="${stampClass}">${logData.stampCount} 枚</span></p>
                               <h4 class="font-bold mt-4">チェック項目</h4>
                               <ul class="list-disc list-inside ml-4">`;
                for(const taskId in logData.checkedTasks){
                     const taskName = handoverTaskMaster[taskId]?.name || '不明な項目';
                     const isChecked = logData.checkedTasks[taskId];
                     const itemClass = !isChecked ? 'text-red-500' : '';
                     detailHTML += `<li class="${itemClass}">${taskName}: ${isChecked ? '実施済み' : '<span class="font-bold">未実施</span>'}</li>`;
                }
                detailHTML += `</ul>`;
            }

            return detailHTML + '</div>';
        }

        function showHistoryDetail(logData) {
            const detailHTML = generateLogDetailHTML(logData);
            const buttons = [
                {id: 'print-single-history-btn', text: 'この履歴をPDF保存', classes: 'hig-btn-primary', onClick: () => printHistory([logData])},
                {id: 'history-detail-close-btn', text: '閉じる', classes: 'hig-btn-secondary', onClick: () => hideModal('history-detail-modal')}
            ];
            createModal('history-detail-modal', '履歴詳細', detailHTML, buttons);
        }

        function logRecordToDate(log) {
            if (!log?.createdAt) return null;
            if (typeof log.createdAt.toDate === 'function') return log.createdAt.toDate();
            if (typeof log.createdAt.seconds === 'number') {
                return new Date(log.createdAt.seconds * 1000 + (log.createdAt.nanoseconds || 0) / 1e6);
            }
            return null;
        }

        function formatPdfFileStem(d) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const h = String(d.getHours()).padStart(2, '0');
            const min = String(d.getMinutes()).padStart(2, '0');
            const s = String(d.getSeconds()).padStart(2, '0');
            return `${y}${m}${day}_${h}${min}${s}`;
        }

        /** カレンダーで選んだ日、またはログ群から PDF 見出し用・ファイル名用ラベルを決定 */
        function getPdfTitleAndFileStem(calendarDate, logs) {
            if (calendarDate instanceof Date && !Number.isNaN(calendarDate.getTime())) {
                const display = calendarDate.toLocaleDateString('ja-JP');
                const y = calendarDate.getFullYear();
                const m = String(calendarDate.getMonth() + 1).padStart(2, '0');
                const day = String(calendarDate.getDate()).padStart(2, '0');
                return { displayTitle: `${display}（${logs.length}件）`, fileStem: `${y}${m}${day}` };
            }
            if (logs?.length === 1) {
                const d = logRecordToDate(logs[0]);
                if (d) {
                    return {
                        displayTitle: d.toLocaleString('ja-JP'),
                        fileStem: formatPdfFileStem(d),
                    };
                }
            }
            if (logs?.length > 1) {
                const dates = logs.map(logRecordToDate).filter(Boolean).sort((a, b) => a - b);
                if (dates.length) {
                    const a = dates[0];
                    const b = dates[dates.length - 1];
                    if (a.getTime() === b.getTime()) {
                        return {
                            displayTitle: `${a.toLocaleString('ja-JP')}（${logs.length}件）`,
                            fileStem: formatPdfFileStem(a),
                        };
                    }
                    return {
                        displayTitle: `${a.toLocaleString('ja-JP')} 〜 ${b.toLocaleString('ja-JP')}（${logs.length}件）`,
                        fileStem: `${formatPdfFileStem(a)}-${formatPdfFileStem(b)}`,
                    };
                }
            }
            const now = new Date();
            return { displayTitle: now.toLocaleString('ja-JP'), fileStem: formatPdfFileStem(now) };
        }

        /** 1 ログ分の HTML をキャプチャし、A4 1 ページに収まるよう縮小して PDF に描画する */
        function addLogPageToPdf(pdf, imgData, canvas) {
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const imgWidth = canvas.width;
            const imgHeight = canvas.height;
            const ratio = imgHeight / imgWidth;
            const totalHeight = pdfWidth * ratio;
            let drawW = pdfWidth;
            let drawH = totalHeight;
            if (drawH > pageHeight) {
                const scale = pageHeight / drawH;
                drawW = pdfWidth * scale;
                drawH = pageHeight;
            }
            const x = (pdfWidth - drawW) / 2;
            pdf.addImage(imgData, 'PNG', x, 0, drawW, drawH);
        }

        async function printHistory(logs, date = null) {
            if (!logs?.length) {
                showAppAlert('出力する履歴がありません。', false);
                return;
            }

            showLoading(true, 'PDFを生成中...');
            const { jsPDF } = window.jspdf;
            const { displayTitle, fileStem } = getPdfTitleAndFileStem(date, logs);
            const isBulk = logs.length > 1;
            const pdf = new jsPDF('p', 'mm', 'a4');

            try {
                for (let i = 0; i < logs.length; i++) {
                    const log = logs[i];
                    showLoading(true, `PDFを生成中... (${i + 1}/${logs.length})`);

                    let subtitle;
                    if (isBulk) {
                        const logTime = log.createdAt.toDate().toLocaleString('ja-JP');
                        subtitle = `${currentState.category} - ${logTime} 履歴（${i + 1}/${logs.length}）`;
                    } else {
                        subtitle = `${currentState.category} - ${displayTitle} 履歴`;
                    }

                    const printContainer = document.createElement('div');
                    printContainer.id = 'print-container-temp';
                    printContainer.style.position = 'absolute';
                    printContainer.style.left = '-9999px';
                    printContainer.style.width = '210mm';

                    printContainer.innerHTML = `
                <div class="p-8">
                    <h1 class="text-2xl font-bold mb-4">${currentState.storeName}</h1>
                    <h2 class="text-xl font-semibold mb-6">${subtitle}</h2>
                    ${generateLogDetailHTML(log, { forPrint: true })}
                </div>`;

                    try {
                        document.body.appendChild(printContainer);
                        const canvas = await html2canvas(printContainer, { scale: 2 });
                        const imgData = canvas.toDataURL('image/png');
                        if (i > 0) pdf.addPage();
                        addLogPageToPdf(pdf, imgData, canvas);
                    } finally {
                        if (printContainer.parentNode) printContainer.parentNode.removeChild(printContainer);
                    }
                }

                pdf.save(`${currentState.category}_${fileStem}_履歴.pdf`);
            } catch (error) {
                console.error('PDFの生成に失敗しました:', error);
                showAppAlert('PDFの生成に失敗しました。', false);
            } finally {
                showLoading(false);
            }
        }


        // --- 並び順設定モーダル ---
        function showStallTypeSelectModal() {
            const content = `<button type="button" id="modal-edit-large-stall-btn" class="hig-btn-primary w-full mb-2">個室大</button>
                             <button type="button" id="modal-edit-small-stall-btn" class="hig-btn-primary w-full">個室小</button>`;
            const buttons = [{ id: 'modal-cancel-stall-btn', text: 'キャンセル', classes: 'hig-btn-secondary', onClick: () => hideModal('stall-select-modal') }];
            createModal('stall-select-modal', '編集する項目を選択', content, buttons);
            document.getElementById('modal-edit-large-stall-btn').addEventListener('click', () => openOrderModalForCategory('toiletLargeStallOrder', '個室大の項目設定'));
            document.getElementById('modal-edit-small-stall-btn').addEventListener('click', () => openOrderModalForCategory('toiletSmallStallOrder', '個室小の項目設定'));
        }

        function showHandoverSelectModal() {
            const content = `<button type="button" id="modal-edit-handover-1-btn" class="hig-btn-purple-fill mb-2">1レジ</button>
                             <button type="button" id="modal-edit-handover-2-btn" class="hig-btn-purple-fill">2レジ</button>`;
            const buttons = [{ id: 'modal-cancel-handover-btn', text: 'キャンセル', classes: 'hig-btn-secondary', onClick: () => hideModal('handover-select-modal') }];
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
            const content = `<div id="order-list-container" class="space-y-4">
                                <div>
                                    <h4 class="text-md font-semibold text-gray-700 mb-2">表示する項目</h4>
                                    <p class="text-xs text-gray-500 mb-2">ドラッグで並び替えができます。</p>
                                    <div id="active-list" class="p-3 border border-black/10 rounded-[10px] min-h-[120px] bg-[rgba(0,122,255,0.08)] space-y-2"></div>
                                </div>
                                <div class="my-4 border-t-2 border-dashed"></div>
                                <div>
                                    <h4 class="text-md font-semibold text-gray-700 mb-2">追加可能な項目 (非表示)</h4>
                                    <p class="text-xs text-gray-500 mb-2">「追加」ボタンで上のリストに追加できます。</p>
                                    <div id="available-list" class="p-3 border border-black/10 rounded-[10px] min-h-[120px] bg-[var(--hig-grouped-bg)] space-y-2"></div>
                                </div>
                             </div>`;
            const buttons = [
                { id: 'cancel-order-btn', text: '戻る', classes: 'hig-btn-secondary', onClick: () => hideModal('order-modal')},
                { id: 'save-order-btn', text: 'この並び順で保存', classes: 'hig-btn-primary', onClick: saveOrder}
            ];
            createModal('order-modal', title, content, buttons);
            
            populateOrderLists();

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
                         if (afterElement == null) {
                             dropTarget.appendChild(draggingItem);
                         } else {
                             dropTarget.insertBefore(draggingItem, afterElement);
                         }
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

        function populateOrderLists() {
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
                div.className = 'sortable-item hig-sortable-item p-3 bg-white border border-black/10 shadow-sm flex items-center justify-between';
                div.draggable = true;
                div.dataset.id = id;
                div.innerHTML = `<div class="flex items-center flex-grow">
                                    <i class="fas fa-grip-vertical text-gray-400 mr-3 cursor-grab"></i>
                                    <span class="flex-grow text-left">${item.name}</span>
                                 </div>
                                 <button type="button" class="remove-item-btn inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-[#ff3b30] hover:opacity-80 rounded-[10px]"><i class="fas fa-minus-circle text-lg"></i></button>`;
                activeList.appendChild(div);
            });

            availableIds.sort((a, b) => masterData[a].name.localeCompare(masterData[b].name, 'ja')).forEach(id => {
                const item = masterData[id];
                if (!item) return;
                const div = document.createElement('div');
                div.className = 'p-3 bg-white border border-black/10 rounded-[10px] shadow-sm flex items-center justify-between';
                div.dataset.id = id;
                div.innerHTML = `<span class="flex-grow text-left">${item.name}</span>
                                 <button type="button" class="add-item-btn inline-flex items-center justify-center min-h-[44px] px-3 text-[#34c759] hover:opacity-80 font-semibold rounded-[10px]"><i class="fas fa-plus-circle mr-1"></i>追加</button>`;
                availableList.appendChild(div);
            });
        }
        
        async function saveOrder() {
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
            const draggableElements = [...container.querySelectorAll('.sortable-item:not(.sortable-ghost)')];
            return draggableElements.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = y - box.top - box.height / 2;
                if (offset < 0 && offset > closest.offset) return { offset, element: child };
                else return closest;
            }, { offset: Number.NEGATIVE_INFINITY }).element;
        }
        
        // --- 警告・通知 ---
        function showWarningAlert(message) {
             if (!message || message.trim() === '') return;
             const buttons = [{ id: 'warning-ok-btn-dynamic', text: 'OK', classes: 'hig-btn-destructive w-full', onClick: () => hideModal('warning-modal-dynamic')}];
            createModal('warning-modal-dynamic', '警告', `<p class="text-sm text-gray-600 whitespace-pre-wrap">${message}</p>`, buttons);
        }
        
        function showAppAlert(message, isSuccess = true) {
            const alertBox = document.createElement('div');
            const tone = isSuccess ? 'hig-toast--success' : 'hig-toast--error';
            alertBox.className = `hig-toast ${tone} transition-opacity duration-300`;
            alertBox.textContent = message;
            document.body.appendChild(alertBox);
            setTimeout(() => {
                alertBox.style.opacity = '0';
                setTimeout(() => alertBox.remove(), 3000);
            }, 2500);
        }
        
        // --- 各チェック項目の描画関数 ---
        function renderTempCheckView(highlightInfo = null) {
            const container = document.getElementById('checklist-container');
            if(!container) return;
            container.innerHTML = '';
            const equipmentOrder = storeSettings[currentState.store]?.equipmentOrder || Object.keys(equipmentMaster);

            equipmentOrder.forEach(id => {
                const item = equipmentMaster[id];
                if (!item) return;

                const card = document.createElement('div');
                card.className = 'hig-check-card space-y-4';
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
                    const tempSel = createDropdown(options);
                    if (isFreezerTempRange(temp_min, temp_max)) {
                        const dfOpt = document.createElement('option');
                        dfOpt.value = 'DF';
                        dfOpt.textContent = 'DF（霜取り中）';
                        tempSel.insertBefore(dfOpt, tempSel.children[1]);
                    }
                    tempDropdownHTML = tempSel.outerHTML;
                } else {
                    tempDropdownHTML = '<input type="number" class="mt-1 block w-full bg-gray-200 border rounded-lg p-2.5" disabled placeholder="温度範囲未設定">';
                }
                
                let drainCheckboxHTML = '';
                if(item.manual_drain === true){
                    drainCheckboxHTML = `<div class="flex items-center pt-5"><input id="drain-check-${id}" type="checkbox" data-field="drain" class="h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"><label for="drain-check-${id}" class="ml-2 text-sm font-medium text-gray-900">排水</label></div>`;
                }

                card.innerHTML = `<div><h3 class="font-semibold text-lg">${item.name}</h3><p class="text-sm text-gray-500">${modelInfo}</p></div>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                        <div><label class="block text-sm font-medium text-gray-700">適温範囲</label><input type="text" class="mt-1 block w-full bg-gray-200 border rounded-lg p-2.5" value="${tempRange}" readonly></div>
                        <div><label class="block text-sm font-medium text-gray-700">検温結果 (℃)</label>${tempDropdownHTML}</div><div>${drainCheckboxHTML}</div>
                        <div><label class="block text-sm font-medium text-gray-700">連絡先</label>${createDropdown(["未連絡（自己責任対応）", "クルー", "リーダー", "メンテナンスセンター", "クルーとメンテナンスセンター", "リーダーとメンテナンスセンター", "店長", "本部社員OFC", "オーナー"]).outerHTML}</div>
                        <div><label class="block text-sm font-medium text-gray-700">処置</label>${createDropdown(["連絡待ち", "処置済", "経過観察"]).outerHTML}</div>
                    </div>`;
                
                if(hasTempRange) card.querySelector('select').dataset.field = 'temperature';
                card.querySelector('div.grid > div:nth-child(4) > select').dataset.field = 'contact';
                card.querySelector('div.grid > div:nth-child(5) > select').dataset.field = 'action';
                container.appendChild(card);
                
                if(hasTempRange){
                    const tempSelect = card.querySelector('[data-field="temperature"]');
                    tempSelect?.addEventListener('change', (e) => {
                        const raw = e.target.value;
                        if (raw === 'DF' || raw === '') {
                            e.target.classList.remove('bg-red-200');
                            return;
                        }
                        const value = parseFloat(raw);
                        if (isNaN(value)) return;
                        const isOutOfRange = value < temp_min || value > temp_max;
                        e.target.classList.toggle('bg-red-200', isOutOfRange);
                        if (isOutOfRange) showWarningAlert("適温でない場合は必ず上長、もしくはメンテナンスセンター(0120-190-711)に連絡願います。\nメンテナンスセンターに連絡するときには、必ず店番と異常什器の型番、症状などを落ち着いて伝えてください");
                    });
                }

                card.querySelector('[data-field="contact"]')?.addEventListener('change', (e) => {
                    const isSelfResponsibility = e.target.value === "未連絡（自己責任対応）";
                    e.target.classList.toggle('bg-red-200', isSelfResponsibility);
                    if(isSelfResponsibility) showWarningAlert("自己責任対応の場合、この異常が原因で被害が広がった場合には、自己責任で対応するつもりでお願いします");
                });
            });

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
                card.className = 'hig-check-card space-y-4';
                card.dataset.itemId = id;

                card.innerHTML = `
                    <h3 class="font-semibold text-lg">${item.name}</h3>
                    <div class="space-y-4">
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700">作業状況</label>
                                ${createDropdown(['実施', '未実施']).outerHTML}
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">作業時間帯</label>
                                ${createDropdown(['早朝', '昼勤', '夕勤', '準深夜', '深夜']).outerHTML}
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">実施者</label>
                                ${createDropdown([], true, sortedStaff).outerHTML}
                            </div>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700">異常時の処置</label>
                                ${createDropdown(["連絡待ち", "処置済", "経過観察"]).outerHTML}
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">連絡先</label>
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
            if (!container) return;
            container.innerHTML = '';
            const createToiletSection = (sectionName, orderType) => {
                const card = document.createElement('div');
                card.className = 'hig-check-card space-y-3';
                card.dataset.section = sectionName;
                card.innerHTML = `<h3 class="font-semibold text-lg">${sectionName}</h3>`;

                const customOrder = storeSettings[currentState.store]?.[orderType] || [];
                const tasksToShow = customOrder.map(id => ({ id, ...toiletMaster[id] })).filter(task => task.name);
                
                if (tasksToShow.length === 0) {
                    card.innerHTML += '<p class="text-gray-500 text-sm p-2">表示項目が未設定です。「並び順を設定」から項目を追加してください。</p>';
                    return card;
                }

                const tableContainer = document.createElement('div');
                tableContainer.className = "overflow-x-auto";
                tableContainer.innerHTML = `<table class="w-full text-center">
                    <thead class="text-xs text-gray-700 uppercase bg-gray-200"><tr>${tasksToShow.map(task => `<th class="px-2 py-2 font-medium">${task.name || 'N/A'}</th>`).join('')}</tr></thead>
                    <tbody><tr class="bg-white">${tasksToShow.map(task => `<td class="p-2 border"><input type="checkbox" data-task-id="${task.id}" class="h-6 w-6 text-blue-600 rounded focus:ring-blue-500 mx-auto"></td>`).join('')}</tr></tbody>
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
                card.className = 'hig-check-card space-y-4 handover-section';
                card.dataset.orderType = orderType;
                card.innerHTML = `<h3 class="font-semibold text-lg">${sectionName}</h3>`;

                const infoContainer = document.createElement('div');
                infoContainer.className = 'p-4 border-b space-y-4';
                
                const sortedStaff = getSortedStaff();
                const timeOptions = Array.from({length: 96}, (_, i) => `${String(Math.floor(i/4)).padStart(2,'0')}:${String((i%4)*15).padStart(2,'0')}`);
                
                const staffGrid = document.createElement('div');
                staffGrid.className = 'grid grid-cols-2 gap-4';
                staffGrid.innerHTML = `
                    <div>
                        <label class="block text-sm font-medium">時間担当者</label>
                        ${createDropdown([], true, sortedStaff).outerHTML}
                    </div>
                    <div>
                        <label class="block text-sm font-medium">チェック担当者</label>
                        ${createDropdown([], true, sortedStaff).outerHTML}
                    </div>
                `;
                staffGrid.querySelector('div:nth-child(1) select').dataset.field = "timeStaffId";
                staffGrid.querySelector('div:nth-child(2) select').dataset.field = "checkStaffId";
                infoContainer.appendChild(staffGrid);

                const timeStampGrid = document.createElement('div');
                timeStampGrid.className = 'grid grid-cols-3 gap-4';
                timeStampGrid.innerHTML = `
                    <div><label class="block text-sm font-medium">開始時間</label>${createDropdown(timeOptions).outerHTML}</div>
                    <div><label class="block text-sm font-medium">終了時間</label>${createDropdown(timeOptions).outerHTML}</div>
                    <div><label class="block text-sm font-medium">印紙枚数</label>${createDropdown(Array.from({length: 11}, (_, i) => i)).outerHTML}</div>`;

                timeStampGrid.querySelector('div:nth-child(1) select').dataset.field = "startTime";
                timeStampGrid.querySelector('div:nth-child(2) select').dataset.field = "endTime";
                const stampSelect = timeStampGrid.querySelector('div:nth-child(3) select');
                stampSelect.dataset.field = "stampCount";
                stampSelect.addEventListener('change', (e) => {
                    const isLow = parseInt(e.target.value, 10) <= 2;
                    e.target.classList.toggle('bg-yellow-200', isLow);
                    e.target.classList.toggle('border-yellow-500', isLow);
                });
                infoContainer.appendChild(timeStampGrid);
                card.appendChild(infoContainer);
                
                const customOrder = storeSettings[currentState.store]?.[orderType] || [];
                const tasksToShow = customOrder.map(id => ({ id, ...handoverTaskMaster[id] })).filter(task => task.name);

                if (tasksToShow.length > 0) {
                    const checkGridContainer = document.createElement('div');
                    checkGridContainer.className = "overflow-x-auto";
                    let gridHTML = `<div class="grid p-2 text-center" style="grid-template-columns: repeat(${tasksToShow.length}, minmax(80px, 1fr));">`;
                    tasksToShow.forEach(task => gridHTML += `<div class="font-medium text-sm flex items-center justify-center p-1 bg-gray-200 rounded-md vertical-text-container"><div class="vertical-text">${task.name || 'N/A'}</div></div>`);
                    tasksToShow.forEach(task => gridHTML += `<div class="flex items-center justify-center p-2 border-t mt-2"><input type="checkbox" data-task-id="${task.id}" class="h-6 w-6 text-blue-600 rounded focus:ring-blue-500"></div>`);
                    gridHTML += '</div>';
                    checkGridContainer.innerHTML = gridHTML;
                    card.appendChild(checkGridContainer);
                } else {
                     card.innerHTML += '<p class="text-gray-500 text-sm p-2">表示項目が未設定です。「並び順を設定」から項目を追加してください。</p>';
                }

                const saveButtonContainer = document.createElement('div');
                saveButtonContainer.className = 'mt-4 flex justify-end';
                saveButtonContainer.innerHTML = `<button type="button" class="hig-btn-purple-fill max-w-md"><i class="fas fa-save mr-2"></i>${sectionName}の情報を保存</button>`;
                saveButtonContainer.querySelector('button').addEventListener('click', handleHandoverSave);
                card.appendChild(saveButtonContainer);
                
                return card;
            };

            container.appendChild(createHandoverSection('1レジ', 'handover1Order'));
            container.appendChild(createHandoverSection('2レジ', 'handover2Order'));

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

        /**
         * ダッシュボード画面を初期描画する
         */
        function renderDashboardView() {
            const dashboardView = document.getElementById('dashboard-view');
            const mainAppView = document.getElementById('main-app-view');
            const checklistView = document.getElementById('checklist-view');
            mainAppView.style.display = 'none'; 
            dashboardView.style.display = 'block';
            checklistView.style.display = 'none';

            const todayBiz = getBusinessDateString();

            dashboardView.innerHTML = `
                <div class="hig-card p-4 sm:p-6">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b border-black/10 pb-4 gap-4">
                        <button type="button" class="back-to-main hig-link-back shrink-0"><i class="fas fa-chevron-left mr-2"></i>カテゴリ選択に戻る</button>
                        <div class="text-center flex-grow order-first sm:order-none">
                             <h1 class="hig-title-medium">${currentState.storeName}</h1>
                             <h2 class="text-[17px] font-semibold text-black/60 mt-1">ダッシュボード</h2>
                             <p class="hig-footnote mt-1">表示は営業日ベース（朝${BUSINESS_DAY_START_HOUR}:00 切替）</p>
                        </div>
                        <div class="w-full sm:w-auto">
                            <label for="dashboard-date" class="text-[15px] font-semibold text-black/70">営業日</label>
                            <input type="date" id="dashboard-date" value="${todayBiz}" class="hig-field mt-1 w-full sm:w-auto">
                        </div>
                    </div>
                    <div id="dashboard-content" class="space-y-6">
                         <div class="text-center p-8"><div class="loader mx-auto"></div><p class="mt-2 hig-footnote">データを読み込んでいます...</p></div>
                    </div>
                </div>`;
            
            document.querySelector('#dashboard-view .back-to-main').addEventListener('click', backToMainView);
            document.getElementById('dashboard-date').addEventListener('change', (e) => {
                const ymd = e.target.value;
                if (ymd) updateDashboard(ymd);
            });

            updateDashboard(todayBiz);
        }

        /**
         * ダッシュボードの表示内容を更新する
         * @param {string} [pathDateStr] - ログパス用 YYYY-MM-DD（営業日）。省略時は本日の営業日
         */
        async function updateDashboard(pathDateStr) {
            const contentEl = document.getElementById('dashboard-content');
            contentEl.innerHTML = `<div class="text-center p-8"><div class="loader mx-auto"></div><p class="mt-2 hig-footnote">データを読み込んでいます...</p></div>`;
            
            const logData = await fetchDashboardData(pathDateStr || getBusinessDateString());
            
            let summaryHTML = '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">';
            let issuesHTML = '';

            const tempSummary = processTempLogs(logData.temperature);
            summaryHTML += createSummaryCard('温度チェック', 'fa-thermometer-half', 'red', tempSummary.total, tempSummary.issueCount);
            if (tempSummary.issues.length > 0) issuesHTML += createIssueCard('温度チェック', 'fa-thermometer-half', 'red', tempSummary.issues);

            const haccpSummary = processHaccpLogs(logData.haccp);
            summaryHTML += createSummaryCard('HACCPチェック', 'fa-clipboard-check', 'green', haccpSummary.total, haccpSummary.issueCount);
            if (haccpSummary.issues.length > 0) issuesHTML += createIssueCard('HACCPチェック', 'fa-clipboard-check', 'green', haccpSummary.issues);
            
            const toiletSummary = processToiletLogs(logData.toilet_cleaning);
            summaryHTML += createSummaryCard('トイレ掃除', 'fa-restroom', 'blue', toiletSummary.total, toiletSummary.issueCount);
            if (toiletSummary.issues.length > 0) issuesHTML += createIssueCard('トイレ掃除', 'fa-restroom', 'blue', toiletSummary.issues);
            
            const handoverSummary = processHandoverLogs(logData.handover);
            summaryHTML += createSummaryCard('引き継ぎチェック', 'fa-people-arrows', 'purple', handoverSummary.total, handoverSummary.issueCount);
            if (handoverSummary.issues.length > 0) issuesHTML += createIssueCard('引き継ぎチェック', 'fa-people-arrows', 'purple', handoverSummary.issues);

            summaryHTML += '</div>';

            if(issuesHTML) {
                issuesHTML = `<h3 class="text-[20px] font-semibold text-black mt-8 border-b border-black/10 pb-2">要確認項目</h3><div class="space-y-4 mt-4">${issuesHTML}</div>`;
            } else {
                 issuesHTML = `<div class="mt-8 text-center p-6 rounded-[12px] border border-black/10 bg-[var(--hig-grouped-bg)]"><i class="fas fa-check-circle text-[#34c759] text-3xl mb-2"></i><p class="text-black/70 text-[17px]">この日の記録に、特に注意が必要な項目はありませんでした。</p></div>`;
            }

            contentEl.innerHTML = summaryHTML + issuesHTML;

            contentEl.querySelectorAll('.history-detail-link').forEach(link => {
                link.addEventListener('click', handleHistoryLinkClick);
            });
        }

        async function fetchDashboardData(dateStr) {
            const storeId = currentState.store;
            const fetchErrors = [];

            async function loadEntries(key, logCategory) {
                const path = logEntriesPath(logCategory, storeId, dateStr);
                try {
                    const snapshot = await getDocs(query(collection(db, path)));
                    return snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
                } catch (e) {
                    console.error(`ダッシュボード取得失敗 (${key}):`, e);
                    fetchErrors.push(`${key}: ${e.message || String(e)}`);
                    return [];
                }
            }

            const [temperature, haccp, toilet_cleaning] = await Promise.all([
                loadEntries('temperature', 'temperature'),
                loadEntries('haccp', 'haccp'),
                loadEntries('toilet_cleaning', 'toilet_cleaning'),
            ]);

            let handover = [];
            try {
                const [snap1, snap2] = await Promise.all([
                    getDocs(collection(db, handoverOrderPath(storeId, dateStr, 'handover1Order'))),
                    getDocs(collection(db, handoverOrderPath(storeId, dateStr, 'handover2Order'))),
                ]);
                handover = [
                    ...snap1.docs.map(d => ({ ...d.data(), id: d.id, orderType: 'handover1Order' })),
                    ...snap2.docs.map(d => ({ ...d.data(), id: d.id, orderType: 'handover2Order' })),
                ];
            } catch (e) {
                console.error('ダッシュボード取得失敗 (handover):', e);
                fetchErrors.push(`handover: ${e.message || String(e)}`);
            }

            if (fetchErrors.length > 0) {
                showAppAlert(
                    `ダッシュボードの一部データを取得できませんでした。\n${fetchErrors.join('\n')}`,
                    false,
                );
            }

            return { temperature, haccp, toilet_cleaning, handover };
        }

        function dashboardLogMillis(log) {
            if (!log?.createdAt) return 0;
            if (typeof log.createdAt.toMillis === 'function') return log.createdAt.toMillis();
            if (typeof log.createdAt.seconds === 'number') {
                return log.createdAt.seconds * 1000 + (log.createdAt.nanoseconds || 0) / 1e6;
            }
            return 0;
        }

        function processTempLogs(logs) {
            const issues = [];
            if (!logs || logs.length === 0) return { total: 0, issueCount: 0, issues: [] };

            const sorted = [...logs].sort((a, b) => dashboardLogMillis(b) - dashboardLogMillis(a));
            sorted.forEach((log) => {
                if (!log?.data?.checks || !Array.isArray(log.data.checks)) return;
                log.data.checks.forEach((check) => {
                    const itemInfo = equipmentMaster[check.equipmentId];
                    if (!itemInfo) return;
                    const temp_min = parseFloat(itemInfo.temp_min);
                    const temp_max = parseFloat(itemInfo.temp_max);
                    const tempValue = parseFloat(check.temperature);
                    const rawT = check.temperature != null ? String(check.temperature).trim() : '';

                    if (rawT !== 'DF' && !isNaN(tempValue) && (!isNaN(temp_min) && !isNaN(temp_max)) && (tempValue < temp_min || tempValue > temp_max)) {
                        issues.push({
                            text: `「${itemInfo.name}」が適温外 (${tempValue}℃)`,
                            category: '温度チェック',
                            log,
                        });
                    }
                    if (itemInfo.manual_drain === true && check.drainChecked === false) {
                        issues.push({
                            text: `「${itemInfo.name}」の排水が未実施`,
                            category: '温度チェック',
                            log,
                        });
                    }
                });
            });
            return { total: logs.length, issueCount: issues.length, issues };
        }

        function processHaccpLogs(logs) {
            const issues = [];
            if (!logs || logs.length === 0) return { total: 0, issueCount: 0, issues: [] };

            const sorted = [...logs].sort((a, b) => dashboardLogMillis(b) - dashboardLogMillis(a));
            sorted.forEach((log) => {
                if (!log?.data?.checks || !Array.isArray(log.data.checks)) return;
                log.data.checks.forEach((check) => {
                    if (check.status === '未実施') {
                        const itemName = haccpMaster[check.itemId]?.name || '不明な項目';
                        issues.push({
                            text: `「${itemName}」が未実施`,
                            category: 'HACCPチェック',
                            log,
                        });
                    }
                });
            });
            return { total: logs.length, issueCount: issues.length, issues };
        }
        
        function processToiletLogs(logs) {
            const issues = [];
            if (!logs || logs.length === 0) return { total: 0, issueCount: 0, issues: [] };

            const sorted = [...logs].sort((a, b) => dashboardLogMillis(b) - dashboardLogMillis(a));
            sorted.forEach((log) => {
                if (!log?.data?.checks || typeof log.data.checks !== 'object') return;
                Object.entries(log.data.checks).forEach(([section, tasks]) => {
                    if (!tasks || typeof tasks !== 'object') return;
                    Object.entries(tasks).forEach(([taskId, isChecked]) => {
                        if (!isChecked) {
                            const taskName = toiletMaster[taskId]?.name || '不明な項目';
                            issues.push({
                                text: `トイレ掃除 (${section}) の「${taskName}」が未チェック`,
                                category: 'トイレ掃除',
                                log,
                            });
                        }
                    });
                });
            });
            return { total: logs.length, issueCount: issues.length, issues };
        }
        
        function processHandoverLogs(logs) {
            let issueCount = 0;
            const issues = [];
            if (!logs || logs.length === 0) return { total: 0, issueCount: 0, issues: [] };
            
            logs.forEach(log => {
                 const logIdentifier = log.orderType === 'handover1Order' ? '1レジ' : '2レジ';
                 if (parseInt(log.stampCount, 10) <= 2) {
                     issueCount++;
                     issues.push({
                         text: `${logIdentifier} の印紙枚数が少ない (${log.stampCount}枚)`,
                         category: '引き継ぎチェック',
                         log: log
                     });
                 }
                 Object.entries(log.checkedTasks).forEach(([taskId, isChecked]) => {
                     if(!isChecked) {
                         const taskName = handoverTaskMaster[taskId]?.name || '不明な項目';
                         issueCount++;
                         issues.push({
                             text: `${logIdentifier} の「${taskName}」が未チェック`,
                             category: '引き継ぎチェック',
                             log: log
                         });
                     }
                 });
            });
            return { total: logs.length, issueCount, issues };
        }

        // --- ダッシュボード用UI生成ヘルパー ---
        function createSummaryCard(title, icon, color, total, issueCount) {
             const colorClasses = {
                red: 'text-red-500 bg-red-50',
                green: 'text-green-500 bg-green-50',
                blue: 'text-blue-500 bg-blue-50',
                purple: 'text-purple-500 bg-purple-50',
             };
            return `
                <div class="hig-dash-metric p-4 flex items-center justify-between gap-3">
                    <div>
                        <p class="text-[15px] font-medium text-black/50">${title}</p>
                        ${total > 0 ? `<p class="text-[28px] font-bold text-black tracking-tight">${total}回実施</p>` : `<p class="text-xl font-semibold text-black/35">未実施</p>`}
                    </div>
                    ${total > 0 ? `
                        <div class="text-right shrink-0">
                           ${issueCount > 0 ? 
                                `<p class="text-[17px] font-semibold text-[#ff3b30]">${issueCount}件の要確認項目</p>` :
                                `<p class="text-[17px] font-semibold text-[#34c759]">問題なし</p>`
                           }
                        </div>
                    ` : ''}
                    <div class="text-3xl p-3 rounded-full ${colorClasses[color]} shrink-0">
                        <i class="fas ${icon}"></i>
                    </div>
                </div>`;
        }
        
        function createIssueCard(title, icon, color, issues) {
            const colorClasses = {
                red: 'border-red-500',
                green: 'border-green-500',
                blue: 'border-blue-500',
                purple: 'border-purple-500',
            };

            const issueItemsHTML = issues.map(issue => {
                if (!issue.log || !issue.log.createdAt) return `<li>${issue.text} (時刻不明)</li>`;

                const time = issue.log.createdAt.toDate().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                const staffId = issue.log.checkStaffId || issue.log.staffId || 'unknown';
                const staffInfo = staffMaster[staffId] || {};
                const staffName = staffInfo.nickname || `${staffInfo.lastName || ''} ${staffInfo.firstName || ''}`.trim() || '不明';

                return `
                    <li class="flex justify-between items-center">
                        <button type="button" class="history-detail-link text-left text-[#ff3b30] hover:underline min-h-[44px] py-1"
                                data-category='${issue.category}'
                                data-log='${JSON.stringify(issue.log)}'>
                            ${issue.text}
                        </button>
                        <span class="text-xs text-gray-500 whitespace-nowrap pl-4">${time} / ${staffName}</span>
                    </li>`;
            }).join('');

            return `
                <div class="hig-dash-metric p-4 border-l-4 ${colorClasses[color]}">
                    <h4 class="font-semibold text-[17px] text-black/80"><i class="fas ${icon} mr-2"></i>${title}</h4>
                    <ul class="mt-2 ml-4 list-disc list-inside text-[15px] text-black/80 space-y-2">
                        ${issueItemsHTML}
                    </ul>
                </div>`;
        }

        function handleHistoryLinkClick(event) {
            const target = event.currentTarget;
            const { category, log } = target.dataset;
            if (!category || !log) return;
            
            try {
                const parsedLog = JSON.parse(log);

                // FirestoreのTimestampオブジェクトをDateオブジェクトに変換する処理
                if (parsedLog.createdAt && typeof parsedLog.createdAt.seconds === 'number') {
                    const date = new Date(parsedLog.createdAt.seconds * 1000 + (parsedLog.createdAt.nanoseconds || 0) / 1000000);
                    // showHistoryDetail が toDate() メソッドを期待しているため、互換性のあるオブジェクトを作成
                    parsedLog.createdAt = {
                        toDate: () => date,
                        toMillis: () => date.getTime()
                    };
                }
                
                currentState.category = category;
                showHistoryDetail(parsedLog);

            } catch(e) {
                console.error("Failed to parse log data from dashboard link:", e);
                showAppAlert("履歴詳細の表示に失敗しました。", false);
            }
        }
        
        // --- 初期化処理の実行 ---
        initializeApplication();

