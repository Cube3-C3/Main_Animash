
    class StatsManager {
        constructor() {
            this.storageKey = 'gorus_word_per_index_stats';
        }

        loadData() {
            try {
                const rawData = localStorage.getItem(this.storageKey);
                return rawData ? JSON.parse(rawData) || {} : {};
            } catch (e) {
                console.error("Ошибка чтения статистики:", e);
                return {};
            }
        }

        saveData(data) {
            localStorage.setItem(this.storageKey, JSON.stringify(data));
        }

        updateWordStat(word, type, Lvl, singleIndex, isSuccess, timeSec) {
            const upperWord = word.toUpperCase();
            const allStats = this.loadData();

            if (!allStats[upperWord]) {
                allStats[upperWord] = {};
            }

            const taskKey = `${type}_${singleIndex}`;

            if (!allStats[upperWord][taskKey]) {
                allStats[upperWord][taskKey] = {
                    attempts: 0,
                    correct: 0,
                    totalTime: 0,
                    streak: 0
                };
            }

            const currentTaskStat = allStats[upperWord][taskKey];
            currentTaskStat.attempts += 1;
            if (isSuccess) {
                currentTaskStat.correct += 1;
                currentTaskStat.streak = (currentTaskStat.streak || 0) + 1;
            } else {
                currentTaskStat.streak = 0;
            }
            currentTaskStat.totalTime += timeSec;

            this.saveData(allStats);
        }

        getPriorityList(currentMode, activeLevels) {
            const allStats = this.loadData();
            let available = DATA.filter(d => d.type === currentMode);

            // Фильтрация по массиву активных уровней (перенесено из code.js)
            if (activeLevels && activeLevels.length > 0) {
                available = available.filter(d => activeLevels.includes(String(d.Lvl)));
            }
            
            if (available.length === 0) {
                available = DATA.filter(d => d.type === currentMode);
            }

            const perIndexTasks = [];
            available.forEach(item => {
                const upperWord = item.word.toUpperCase();
                const wordStatsMap = allStats[upperWord] || {};
                const rawIndexes = item.slots ?? item.indexes ?? item.index ?? [];
                const indexList = Array.isArray(rawIndexes) ? rawIndexes : [rawIndexes];
                
                indexList.forEach(idx => {
                    const taskKey = `${item.type}_${idx}`;
                    const saved = wordStatsMap[taskKey];
                    
                    let priority = 0;
                    if (!saved || saved.attempts === 0) {
                        priority = 1000; 
                    } else {
                        const attempts = saved.attempts;
                        const successRate = saved.correct / attempts;
                        const avgTime = saved.totalTime / attempts;
                        const currentStreak = saved.streak || 0;
                            
                        // Формула приоритета с учетом защиты от спама и стрика
                        priority = ((1 - successRate) * avgTime / Math.log(attempts + 1)) * Math.pow(0.5, currentStreak);
                    }
                    perIndexTasks.push({
                        item: item,
                        singleIndex: idx,
                        priority: priority
                    });
                });
            });

           return perIndexTasks.sort((a, b) => b.priority - a.priority);
        }

        getAllStats() {
            const allStats = this.loadData();
            return Object.keys(allStats).map(wordKey => {
                const wordStatsMap = allStats[wordKey];
                const originalWordData = DATA.find(item => item.word.toUpperCase() === wordKey) || {};
                const rawIndexes = originalWordData.slots ?? originalWordData.indexes ?? originalWordData.index ?? [];
                const indexList = Array.isArray(rawIndexes) ? rawIndexes : [rawIndexes];
                const levelValue = originalWordData.Lvl ?? "";
                const baseType = originalWordData.type ?? "unknown";

                const tasksArray = indexList.map((idx, i) => {
                    let cleanIndex = (idx && typeof idx === 'object') ? i : idx;
                    const taskKey = `${baseType}_${cleanIndex}`;
                    const savedStats = wordStatsMap[taskKey] || { attempts: 0, correct: 0, totalTime: 0, streak: 0 };

                    return {
                        index: cleanIndex,
                        type: baseType,
                        Lvl: levelValue,
                        stats: {
                            attempts: savedStats.attempts,
                            correct: savedStats.correct,
                            totalTime: savedStats.totalTime,
                            streak: savedStats.streak || 0
                        }
                    };
                });
                return { word: wordKey, tasks: tasksArray };
            });
        }

        getSummary() {
            const data = this.loadData();
            let totalAttempts = 0;
            let totalCorrect = 0;
            let wordCount = 0;
            Object.values(data).forEach(wordData => {
                wordCount++;
                Object.values(wordData).forEach(stat => {
                    totalAttempts += stat.attempts;
                    totalCorrect += stat.correct;
                });
            });
            return {
                solved: totalCorrect,
                attempts: totalAttempts,
                successRate: totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0,
                wordsInCache: wordCount
            };
        }
    }

    const statsApp = new StatsManager(); 
    const appState = {
        currentAppMode: 'training',
        currentMode: 'orthography',
        // Интегрирована множественная логика выбора из code.js
        selectedLevels: {
            orthography: ['letter', 'word', 'sentence', 'text'],
            stress: ['letter', 'word'],
            punctuation: ['sentence', 'text']
        },
        currentLevel: 'word', 
        isSessionActive: false,
        currentTask: null,
        mistakesInWord: 0,
        solvedCount: 0,
        attemptsCount: 0,
        streakCount: 0,
        seconds: 0,
        timerInterval: null,
        randomLevels: false,
        showKeyboardSetting: true,
        wordStartTime: 0,
        isProcessingInput: false,
        settings: { multiSlotMode: false },
        inputBatchTimeout: null,
        isMultiKeyPressDetected: false
    };

    const stats = {
        stress: { solved: 0, attempts: 0, streak: 0 },
        orthography: { solved: 0, attempts: 0, streak: 0 }
    };

    const hiddenInput = document.getElementById('hidden-input');

    // --- УТИЛИТЫ UI ---
    function resolveMargin(symbol) {
        if (symbol === 'backspace') return 'mx-0';
        if (symbol === '-') return 'mx-1'; 
        if (symbol === ' ') return 'mx-3'; 
        return 'mx-0'; 
    }

    function setMargin(wrapper, marginClass) {
        wrapper.className = wrapper.className.replace(/\bmx-\d+\b/g, '');
        wrapper.classList.add(marginClass);
    }
    
    function setGap(wrapper, gapClass) {
        wrapper.className = wrapper.className.replace(/\bgap-\d+\b/g, '');
        wrapper.classList.add(gapClass);
    }

    function setSlotEmpty(slot, isEmpty) {
        if (isEmpty) slot.classList.add('ortho-empty');
        else slot.classList.remove('ortho-empty');
    }

    function setSlotCollapsed(slot, collapsed) {
        if (collapsed) slot.classList.add('slot-collapsed');
        else slot.classList.remove('slot-collapsed');
    }

    function toggleTheme(isDark) {
        document.documentElement.classList.toggle('dark', isDark);
        document.documentElement.classList.toggle('light', !isDark);
    }

    function toggleKeyboardSetting(show) {
        appState.showKeyboardSetting = show;
        updateKeyboardVisibility();
    }

    function updateKeyboardVisibility() {
        const kb = document.getElementById('orthography-keyboard');
        if (!kb) {
            // Фолбэк для элемента из code.js, если HTML не менялся
            const kbContainer = document.getElementById('orthography-keyboard-container');
            if (kbContainer) {
                 const show = (appState.isSessionActive && appState.currentMode === 'orthography' && appState.showKeyboardSetting && appState.currentAppMode === 'training');
                 kbContainer.style.display = show ? 'flex' : 'none';
            }
            return;
        }

        if (appState.isSessionActive && appState.currentMode === 'orthography' && appState.showKeyboardSetting && appState.currentAppMode === 'training') {
            kb.style.display = 'flex';
        } else {
            kb.style.display = 'none';
        }
    }

    // --- ЛОГИКА УПРАВЛЕНИЯ УРОВНЯМИ (Из code.js) ---
    function syncLevelPillsVisibility() {
        const available = appState.selectedLevels[appState.currentMode];
        const allLevels = ['letter', 'word', 'sentence', 'text'];
        
        allLevels.forEach(l => {
            const visible = available.includes(l);
            const els = document.querySelectorAll(`[id^="level-${l}"]`);
            els.forEach(el => {
                if (visible) el.classList.remove('hidden');
                else el.classList.add('hidden');
            });
        });
        
        switchLevel(appState.currentLevel, true);
    }

    function toggleLevelSelection(mode, level, isChecked, event) {
        if (isChecked) {
            if (!appState.selectedLevels[mode].includes(level)) {
                appState.selectedLevels[mode].push(level);
            }
        } else {
            if (appState.selectedLevels[mode].length <= 1) {
                if (event) event.target.checked = true;
                return;
            }
            appState.selectedLevels[mode] = appState.selectedLevels[mode].filter(l => l !== level);
        }
        
        updateManageCardBadges(mode);
        
        if (appState.currentMode === mode) {
            if (!isChecked && appState.currentLevel === level) {
                appState.currentLevel = appState.selectedLevels[mode][0];
            }
            syncLevelPillsVisibility();
        }
    }

    function updateManageCardBadges(mode) {
        const container = document.getElementById(`active-levels-${mode}`);
        if (!container) return;
        const levels = appState.selectedLevels[mode];
        const names = {letter: 'Буква', word: 'Слово', sentence: 'Предложение', text: 'Текст'};
        
        container.innerHTML = '';
        levels.forEach(l => {
            const span = document.createElement('span');
            const isActiveMode = mode === appState.currentMode;
            span.className = isActiveMode 
                ? "px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20" 
                : "px-2 py-0.5 rounded-full bg-surface-variant text-text-muted border border-subtle";
            span.textContent = names[l];
            container.appendChild(span);
        });
    }

    function toggleManageMenu(mode) {
        const menu = document.getElementById(`manage-menu-${mode}`);
        const otherMenu = document.getElementById(`manage-menu-${mode === 'orthography' ? 'stress' : 'orthography'}`);
        if (otherMenu) otherMenu.classList.add('hidden');
        if (menu) menu.classList.toggle('hidden');
    }

    function toggleRandomLevels() {
        appState.randomLevels = !appState.randomLevels;
        const btn = document.getElementById('btn-random-levels');
        if (btn) {
            if (appState.randomLevels) {
                btn.classList.remove('text-text-muted', 'dark:text-surface-variant');
                btn.classList.add('text-primary', 'dark:text-inverse-primary');
            } else {
                btn.classList.remove('text-primary', 'dark:text-inverse-primary');
                btn.classList.add('text-text-muted', 'dark:text-surface-variant');
            }
        }
        if (appState.isSessionActive) next();
    }

    function switchLevel(level, force = false) {
        appState.currentLevel = level;
        document.querySelectorAll('.level-button').forEach(btn => {
            btn.classList.remove('active', 'bg-primary', 'text-on-primary', 'shadow-sm');
            if(!btn.classList.contains('disabled')) btn.classList.add('text-text-muted', 'dark:text-surface-variant');
        });
        
        document.querySelectorAll(`[id^="level-${level}"]`).forEach(btn => {
            btn.classList.add('active', 'bg-primary', 'text-on-primary', 'shadow-sm');
            btn.classList.remove('text-text-muted', 'dark:text-surface-variant');
        });

        if (appState.isSessionActive && !force && !appState.randomLevels) next();
        if (appState.currentAppMode === 'profile') switchAppMode('training');
    }

    function switchAppMode(mode) {
        if (appState.isSessionActive && mode === 'profile') endSession();
        
        appState.currentAppMode = mode;
        const btnRandom = document.getElementById('btn-random-levels');
        const footer = document.getElementById('bottom-footer');
        const modeDropdown = document.getElementById('mode-dropdown');
        if (modeDropdown) modeDropdown.classList.add('hidden');
        
        if (mode === 'profile') {
            document.getElementById('current-mode-label').textContent = 'Профиль';
            document.getElementById('start-state').classList.add('hidden');
            document.getElementById('training-state').classList.add('hidden');
            document.getElementById('profile-state').classList.remove('hidden');
            
            const bottomBar = document.getElementById('bottom-stats-bar');
            if(bottomBar) bottomBar.classList.add('hidden');

            if(btnRandom) btnRandom.classList.add('hidden');
            if(footer) footer.classList.add('hidden');
            
            const summary = statsApp.getSummary();
            const valSolved = document.getElementById('profile-solved-val');
            const valSuccess = document.getElementById('profile-success-val');
            if(valSolved) valSolved.textContent = summary.solved;
            if(valSuccess) valSuccess.textContent = summary.successRate + '%';
            
            const statsRaw = document.getElementById('profile-stats-raw');
            if(statsRaw) statsRaw.textContent = JSON.stringify(statsApp.getAllStats(), null, 2);
        } else {
            document.getElementById('current-mode-label').textContent = appState.currentMode === 'orthography' ? 'Орфография' : 'Ударение';
            document.getElementById('profile-state').classList.add('hidden');
            
            if(btnRandom) btnRandom.classList.remove('hidden');
            if(footer) footer.classList.remove('hidden');
            
            if (appState.isSessionActive) {
                document.getElementById('training-state').classList.remove('hidden');
                const bottomBar = document.getElementById('bottom-stats-bar');
                if(bottomBar) bottomBar.classList.remove('hidden');
            } else {
                document.getElementById('start-state').classList.remove('hidden');
            }
            updateKeyboardVisibility();
        }
    }

    function switchProfileTab(tab) {
        const tabStats = document.getElementById('tab-stats') || document.getElementById('profile-stats');
        const tabManage = document.getElementById('tab-manage') || document.getElementById('profile-manage');
        const contentStats = document.getElementById('profile-content-stats');
        const contentManage = document.getElementById('profile-content-manage');
        const profileTitle = document.getElementById('profile-title');

        if (tab === 'stats') {
            if(tabStats) tabStats.className = "py-2 text-sm font-ui-label text-primary dark:text-primary-fixed border-b-2 border-primary dark:border-primary-fixed active";
            if(tabManage) tabManage.className = "py-2 text-sm font-ui-label text-text-muted hover:text-on-surface dark:hover:text-inverse-on-surface transition-colors";
            if(contentStats) contentStats.classList.remove('hidden');
            if(contentManage) contentManage.classList.add('hidden');
            if(profileTitle) profileTitle.textContent = 'Статистика';
            
            const statsRaw = document.getElementById('profile-stats-raw');
            if(statsRaw) {
                statsRaw.style.display = 'block';
                statsRaw.textContent = JSON.stringify(statsApp.getAllStats(), null, 2);
            }
        } else {
            if(tabManage) tabManage.className = "py-2 text-sm font-ui-label text-primary dark:text-primary-fixed border-b-2 border-primary dark:border-primary-fixed active";
            if(tabStats) tabStats.className = "py-2 text-sm font-ui-label text-text-muted hover:text-on-surface dark:hover:text-inverse-on-surface transition-colors";
            if(contentManage) contentManage.classList.remove('hidden');
            if(contentStats) contentStats.classList.add('hidden');
            if(profileTitle) profileTitle.textContent = 'Управление';
            
            const statsRaw = document.getElementById('profile-stats-raw');
            if(statsRaw) statsRaw.style.display = 'none';
        }
    }

    function switchMode(mode) {
        if (appState.isSessionActive) {
            if (!confirm('Текущая сессия будет завершена. Продолжить?')) return;
            endSession();
        }
        
        appState.currentMode = mode;
        const orthBtn = document.getElementById('menu-orthography');
        const stressBtn = document.getElementById('menu-stress');
        
        if (orthBtn) orthBtn.className = 'w-full px-4 py-2 text-left text-sm text-text-muted dark:text-surface-variant hover:bg-surface-container-low dark:hover:bg-inverse-surface transition-colors font-ui-label';
        if (stressBtn) stressBtn.className = 'w-full px-4 py-2 text-left text-sm text-text-muted dark:text-surface-variant hover:bg-surface-container-low dark:hover:bg-inverse-surface transition-colors font-ui-label';
        
        const activeMenu = document.getElementById(`menu-${mode}`);
        if (activeMenu) activeMenu.className = 'w-full px-4 py-2 text-left text-sm bg-primary/10 text-primary dark:text-inverse-primary hover:bg-primary/20 dark:hover:bg-inverse-surface transition-colors font-ui-label';
        
        if (appState.currentAppMode === 'training') {
            document.getElementById('current-mode-label').textContent = mode === 'orthography' ? 'Орфография' : 'Ударение';
        }
        
        const modeDropdown = document.getElementById('mode-dropdown');
        if (modeDropdown) modeDropdown.classList.add('hidden');

        const modeTitle = document.getElementById('mode-title');
        if (modeTitle) modeTitle.textContent = mode === 'orthography' ? 'Орфография' : 'Ударение';

        const available = appState.selectedLevels[mode];
        if (!available.includes(appState.currentLevel)) {
            appState.currentLevel = available[0] || 'word';
        }
        
        syncLevelPillsVisibility();
        resetStatsDisplay();
        updateKeyboardVisibility();
    }

    // --- ДВИЖОК СЕССИЙ И ГЕНЕРАЦИИ (Из code1.js) ---
    function startSession() {
        appState.isSessionActive = true;
        document.getElementById('start-state').classList.add('hidden');
        document.getElementById('training-state').classList.remove('hidden');
        document.getElementById('session-controls').classList.remove('invisible');
        
        const bottomBar = document.getElementById('bottom-stats-bar');
        if (bottomBar) bottomBar.classList.remove('hidden');

        appState.seconds = 0;
        appState.mistakesInWord = 0;
        updateTimeDisplay();
        appState.timerInterval = setInterval(() => {
            appState.seconds++;
            updateTimeDisplay();
        }, 1000);

        next();
    }

    function endSession() {
        appState.isSessionActive = false;
        clearInterval(appState.timerInterval);
        document.getElementById('start-state').classList.remove('hidden');
        document.getElementById('training-state').classList.add('hidden');
        document.getElementById('session-controls').classList.add('invisible');
        document.getElementById('word-container').innerHTML = '';
        document.getElementById('feedback-area').classList.add('opacity-0');
        if(hiddenInput) hiddenInput.blur();
        updateKeyboardVisibility();
    }

    function getRandomWord() {
        let activeLevels = appState.randomLevels ? appState.selectedLevels[appState.currentMode] : [appState.currentLevel];
        const priorityList = statsApp.getPriorityList(appState.currentMode, activeLevels);

        if (!priorityList || priorityList.length === 0) return null;

        const currentWord = appState.currentTask ? appState.currentTask.word : null;
        let candidates = priorityList.filter(p => p.item.word !== currentWord);
        
        if (candidates.length === 0) candidates = priorityList;

        const poolSize = Math.min(3, candidates.length);
        const topPool = candidates.slice(0, poolSize);
        const selected = topPool[Math.floor(Math.random() * topPool.length)];
        
        return { ...selected.item, index: selected.singleIndex };
    }

    function buildWeakSlotsFromWord(word) {
        const weak = [];
        const text = word.toLowerCase();
        for (let i = 0; i < text.length; i++) {
            if (text[i] === '-' || text[i] === ' ') {
                weak.push({ originalIndex: i, index: i, expectedChar: text[i], renderChar: text[i], replaceMode: 'replace' });
            }
        }
        return weak;
    }

    function normalizeSlots(wordData) {
        const raw = wordData.index;
        if (raw === undefined || raw === null) return buildWeakSlotsFromWord(wordData.word);

        const rawList = Array.isArray(raw) ? raw : [raw];
        if (rawList.length === 0) return buildWeakSlotsFromWord(wordData.word);

        let finalRawList = rawList;

        if (!appState.settings?.multiSlotMode) {
            const upperWord = wordData.word.toUpperCase();
            const wordStatsMap = statsApp.loadData()[upperWord] || {};
            
            let worstIndex = rawList[0];
            let maxPriority = -1;

            rawList.forEach(item => {
                const taskKey = `${wordData.type}_${item}`;
                const saved = wordStatsMap[taskKey];
                let prio = 0;
                
                if (!saved || saved.attempts === 0) prio = 1000;
                else prio = ((1 - (saved.correct / saved.attempts)) * (saved.totalTime / saved.attempts)) / Math.log(saved.attempts + 1) * Math.pow(0.5, saved.streak || 0);

                if (prio > maxPriority) {
                    maxPriority = prio;
                    worstIndex = item;
                }
            });
            finalRawList = [worstIndex];
        }

        const displayText = wordData.word.toLowerCase();
        const normalized = [];

        finalRawList.forEach(item => {
            const strIdx = String(item);
            if (!strIdx) return;

            if (strIdx.length >= 2 && strIdx[0] === '9') {
                const y = parseInt(strIdx.slice(1), 10);
                if (Number.isInteger(y) && y >= 0 && y <= displayText.length) {
                    normalized.push({ originalIndex: item, index: y, expectedChar: 'backspace', renderChar: '', replaceMode: 'insert' });
                }
                return;
            }

            const idx = parseInt(strIdx, 10);
            if (Number.isInteger(idx) && idx >= 0 && idx < displayText.length) {
                const char = displayText[idx];
                normalized.push({ originalIndex: item, index: idx, expectedChar: char, renderChar: char, replaceMode: 'replace' });
            }
        });

        return normalized.length > 0 ? normalized : buildWeakSlotsFromWord(wordData.word);
    }

    function parseOrthographyTemplate(wordData) {
        const uiElements = [];
        const normalizedSlots = normalizeSlots(wordData);
        const slotMap = new Map(normalizedSlots.map(s => [s.index, s]));

        for (let i = 0; i <= wordData.word.length; i++) {
            const slotData = slotMap.get(i);
            if (slotData && slotData.replaceMode === 'insert') {
                uiElements.push({ type: 'input', expectedChar: slotData.expectedChar, renderChar: slotData.renderChar, slotId: `gap-${i}`, originalIndex: slotData.originalIndex });
            }

            if (i === wordData.word.length) break;

            if (slotData && slotData.replaceMode !== 'insert') {
                uiElements.push({ type: 'input', expectedChar: slotData.expectedChar, renderChar: slotData.renderChar, slotId: `gap-${i}`, originalIndex: slotData.originalIndex });
            } else {
                if (uiElements.length > 0 && uiElements[uiElements.length - 1].type === 'text') {
                    uiElements[uiElements.length - 1].content += wordData.word[i];
                } else {
                    uiElements.push({ type: 'text', content: wordData.word[i] });
                }
            }
        }
        return { pureRaw: wordData.word, uiElements, originalData: wordData };
    }

    function next() {
        appState.mistakesInWord = 0;
        document.getElementById('feedback-area').classList.add('opacity-0');
        appState.currentTask = getRandomWord();
        
        if (appState.currentTask && appState.currentTask.Lvl) {
            switchLevel(appState.currentTask.Lvl, true);
        }
        
        if (appState.currentTask && appState.currentTask.type === 'orthography') {
            appState.currentTask.parsedData = parseOrthographyTemplate(appState.currentTask);
            appState.currentTask.activeSlotIndex = 0;
            appState.currentTask.slots = appState.currentTask.parsedData.uiElements.filter(el => el.type === 'input');
        }

        renderTask(appState.currentTask);
        appState.wordStartTime = performance.now();
        if (appState.currentMode === 'orthography' && appState.currentAppMode === 'training') {
            setTimeout(() => hiddenInput && hiddenInput.focus(), 50);
        }
        updateKeyboardVisibility();
    }

    // --- ОТРИСОВКА (Из code1.js с адаптацией под стили code.js) ---
    function renderOrthographyTask(item, wordEl, keyboard, instruction) {
        instruction.textContent = 'введите пропущенную букву';
        wordEl.className = 'font-word-display text-primary dark:text-primary-fixed flex items-center justify-center gap-0 tracking-wider select-none whitespace-normal break-words px-2 leading-tight w-full mx-auto';
        
        if (item.word.length <= 16) {
            wordEl.classList.add('text-4xl', 'md:text-6xl');
        } else {
            wordEl.classList.add('text-[20px]');
        }

        const wrapper = document.createElement('div');
        wrapper.id = 'ortho-wrapper';
        wrapper.className = 'flex items-center justify-center gap-0 w-full transition-all duration-300 flex-wrap';
        
        item.parsedData.uiElements.forEach((el) => {
            if (el.type === 'text') {
                const span = document.createElement('span');
                span.className = 'flex-shrink-0';
                span.textContent = el.content;
                wrapper.appendChild(span);
            } else {
                const slotIndex = item.slots.findIndex(s => s.slotId === el.slotId);
                let initialMarginClass = 'mx-2';
                if (el.expectedChar === 'backspace') initialMarginClass = 'mx-4';
                if (el.expectedChar === ' ') initialMarginClass = 'mx-5';
                
                const slotWrapper = document.createElement('div');
                slotWrapper.className = `flex items-center ${initialMarginClass} transition-all duration-300`;
                slotWrapper.id = `wrapper-${el.slotId}`;
                slotWrapper.dataset.initialMargin = initialMarginClass;
                
                const slot = document.createElement('span');
                slot.id = `slot-${el.slotId}`;
                slot.dataset.expected = el.expectedChar;
                slot.className = 'w-[1ch] text-center border-b-4 border-primary dark:border-inverse-primary text-transparent transition-all duration-300 flex-shrink-0 h-[1em] ortho-slot ortho-empty';
                
                if (slotIndex !== item.activeSlotIndex) slot.classList.add('opacity-50');
                slotWrapper.appendChild(slot);
                wrapper.appendChild(slotWrapper);
            }
        });
        
        wordEl.appendChild(wrapper);
        renderKeyboard(keyboard);
    }

    function renderStressTask(item, wordEl, keyboard, instruction) {
        const displayText = item.word.toLowerCase();
        keyboard.style.display = 'none';
        instruction.textContent = 'кликните по ударной гласной';
        
        wordEl.className = 'font-word-display text-primary dark:text-primary-fixed flex items-center justify-center gap-0 tracking-wider select-none whitespace-normal break-words px-2 leading-tight w-full mx-auto';
        if (item.word.length <= 16) wordEl.classList.add('text-4xl', 'md:text-6xl');
        else wordEl.classList.add('text-[20px]');

        displayText.split('').forEach((ch, i) => {
            if (i === item.index || 'аеёиоуыэюя'.includes(ch)) {
                const btn = document.createElement('button');
                btn.className = 'vowel-button px-1 cursor-pointer';
                btn.textContent = ch;
                btn.dataset.stressChoice = i === item.index ? 'correct' : 'wrong';
                wordEl.appendChild(btn);
            } else {
                const span = document.createElement('span');
                span.textContent = ch;
                wordEl.appendChild(span);
            }
        });
    }

    function renderKeyboard(keyboard) {
        if (!keyboard) return;
        keyboard.innerHTML = '';
        const layout = [['й','ц','у','к','е','н','г','ш','щ','з','х','ъ'],['ф','ы','в','а','п','р','о','л','д','ж','э','ё'],['-','я','ч','с','м','и','т','ь','б','ю','backspace'],['space']];
        layout.forEach(row => {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'keyboard-row flex justify-center gap-2 w-full';
            row.forEach(key => {
                const b = document.createElement('button');
                if (key === 'space') { b.className='keyboard-key-wide'; b.innerText='пробел'; b.dataset.keyInput=' '; }
                else if (key === 'backspace') { b.className='keyboard-key w-16'; b.innerHTML='<span class="material-symbols-outlined text-[20px]">backspace</span>'; b.dataset.keyInput='backspace'; }
                else { b.className='keyboard-key'; b.innerText=key; b.dataset.keyInput=key; }
                rowDiv.appendChild(b);
            });
            keyboard.appendChild(rowDiv);
        });
    }

    function renderTask(item) {
        if (!item) return;
        const wordEl = document.getElementById('word-container');
        const keyboard = document.getElementById('orthography-keyboard') || document.getElementById('orthography-keyboard-container');
        const instruction = document.getElementById('instruction-text');
        
        if (keyboard) keyboard.innerHTML = '';
        if (wordEl) wordEl.innerHTML = '';
        
        if (item.type === 'orthography') return renderOrthographyTask(item, wordEl, keyboard, instruction);
        if (item.type === 'stress') return renderStressTask(item, wordEl, keyboard, instruction);
    }

    // --- ОБРАБОТКА ВВОДА (ANTI-CHEAT) ---
    function handleOrthography(ch) {
        if (!appState.currentTask || appState.currentMode !== 'orthography' || appState.currentAppMode !== 'training') return;
        if (!appState.currentTask.slots || appState.currentTask.activeSlotIndex >= appState.currentTask.slots.length) return;

        ch = ch.toLowerCase();
        const activeSlotData = appState.currentTask.slots[appState.currentTask.activeSlotIndex];
        const expected = activeSlotData.expectedChar.toLowerCase();

        const slotId = activeSlotData.slotId;
        const slot = document.getElementById(`slot-${slotId}`);
        const slotWrapper = document.getElementById(`wrapper-${slotId}`);
        if (!slot || !slotWrapper) return;

        if (appState.isProcessingInput) {
            if (appState.inputBatchTimeout && !appState.isMultiKeyPressDetected) {
                appState.isMultiKeyPressDetected = true;
                slot.classList.add('text-error');
                slot.textContent = '❌'; 
                showFeedback(false, "Зажато несколько клавиш!");
            }
            return; 
        }

        appState.isProcessingInput = true;
        appState.isMultiKeyPressDetected = false;

        if (ch === expected) {
            slot.textContent = activeSlotData.renderChar || expected;
            slot.classList.remove('text-transparent');
            slot.classList.add('text-primary', 'dark:text-inverse-primary');
        } else {
            slot.textContent = ch === 'backspace' ? '⌫' : ch;
            slot.classList.remove('text-transparent');
            slot.classList.add('text-error');
        }

        appState.inputBatchTimeout = setTimeout(() => {
            if (appState.isMultiKeyPressDetected) {
                appState.mistakesInWord++;
                appState.streakCount = 0;
                updateScore();
                
                setTimeout(() => {
                    slot.textContent = '';
                    setSlotEmpty(slot, true);
                    slot.classList.remove('text-error', 'text-transparent');
                    slot.classList.add('text-transparent');
                    appState.isProcessingInput = false;
                    appState.inputBatchTimeout = null;
                }, 600);
                return;
            }

            appState.attemptsCount++;
            setMargin(slotWrapper, resolveMargin(ch));

            if (ch === expected) {
                appState.solvedCount++;
                const timeSec = (performance.now() - appState.wordStartTime) / 1000;
                
                statsApp.updateWordStat(
                    appState.currentTask.word, 
                    appState.currentTask.type, 
                    appState.currentTask.Lvl, 
                    activeSlotData.originalIndex, 
                    appState.mistakesInWord === 0, 
                    timeSec
                );
                
                appState.streakCount = (appState.mistakesInWord === 0) ? appState.streakCount + 1 : 0;
                slot.classList.remove('border-b-4', 'opacity-50');

                if (ch === 'backspace') {
                    slot.textContent = '';
                    setSlotCollapsed(slot, true);
                } else if (ch === '-') {
                    slot.textContent = '-';
                    setSlotCollapsed(slot, false);
                } else if (ch === ' ') {
                    slot.textContent = '';
                    setSlotCollapsed(slot, false);
                } else {
                    setSlotEmpty(slot, false);
                    setSlotCollapsed(slot, false);
                }

                showFeedback(true, "Верно!");
                updateScore();
                
                appState.currentTask.activeSlotIndex++;
                appState.mistakesInWord = 0;
                appState.wordStartTime = performance.now(); 
                
                if (appState.currentTask.activeSlotIndex < appState.currentTask.slots.length) {
                    const nextSlot = document.getElementById(`slot-${appState.currentTask.slots[appState.currentTask.activeSlotIndex].slotId}`);
                    if (nextSlot) nextSlot.classList.remove('opacity-50');
                    
                    appState.isProcessingInput = false;
                    appState.inputBatchTimeout = null;
                } else {
                    setTimeout(() => {
                        appState.isProcessingInput = false;
                        appState.inputBatchTimeout = null;
                        next();
                    }, 700);
                }
            } else {
                appState.mistakesInWord++;
                appState.streakCount = 0;
                showFeedback(false, "Ошибка!");
                updateScore();

                setTimeout(() => {
                    slot.textContent = '';
                    setSlotEmpty(slot, true);
                    slot.classList.remove('text-error', 'text-transparent');
                    slot.classList.add('text-transparent');
                    const initialMargin = slotWrapper.dataset.initialMargin || 'mx-2';
                    setMargin(slotWrapper, initialMargin);
                    
                    appState.isProcessingInput = false;
                    appState.inputBatchTimeout = null;
                }, 500);
            }
        }, 30);
    }

    function handleStress(correct, element) {
        if (element.classList.contains('correct') || element.classList.contains('wrong') || appState.currentAppMode !== 'training') return;
        appState.attemptsCount++;
        if (correct) {
            appState.solvedCount++;
            const timeSec = (performance.now() - appState.wordStartTime) / 1000;
            statsApp.updateWordStat(appState.currentTask.word, appState.currentTask.type, appState.currentTask.Lvl, appState.currentTask.index, appState.mistakesInWord === 0, timeSec);
            
            if (appState.mistakesInWord === 0) appState.streakCount++; else appState.streakCount = 0;
            element.classList.add('correct');
            showFeedback(true, "Верно!");
            updateScore();
            setTimeout(next, 700);
        } else {
            appState.mistakesInWord++;
            appState.streakCount = 0;
            element.classList.add('wrong');
            showFeedback(false, "Ошибка!");
            updateScore();
            setTimeout(() => element.classList.remove('wrong'), 400);
        }
    }

    function showFeedback(isSuccess, text) {
        const area = document.getElementById('feedback-area');
        const container = document.getElementById('feedback-container');
        const icon = document.getElementById('feedback-icon');
        const textEl = document.getElementById('feedback-text');
        
        if (!textEl || !area || !container || !icon) return;
        textEl.textContent = text;
        
        if (isSuccess) {
            container.className = "text-success font-ui-label text-xs flex items-center gap-1 bg-success/10 px-4 py-1.5 rounded-full border border-success/20";
            icon.textContent = "check_circle";
        } else {
            container.className = "text-error font-ui-label text-xs flex items-center gap-1 bg-error/10 px-4 py-1.5 rounded-full border border-error/20";
            icon.textContent = "error";
        }
        area.classList.remove('opacity-0');
    }

    function updateScore() {
        stats[appState.currentMode].solved = appState.solvedCount;
        stats[appState.currentMode].attempts = appState.attemptsCount;
        stats[appState.currentMode].streak = appState.streakCount;
        updateStatsDisplay();
    }

    function updateStatsDisplay() {
        const solEl = document.getElementById('stat-solved');
        const strEl = document.getElementById('stat-streak');
        const sucEl = document.getElementById('stat-success');
        
        if(solEl) solEl.textContent = appState.solvedCount;
        if(strEl) strEl.textContent = appState.streakCount;
        if(sucEl) {
            const successRate = appState.attemptsCount === 0 ? 0 : Math.round((appState.solvedCount / appState.attemptsCount) * 100);
            sucEl.textContent = `${successRate}%`;
        }
    }

    function resetStatsDisplay() {
        appState.solvedCount = stats[appState.currentMode].solved || 0;
        appState.attemptsCount = stats[appState.currentMode].attempts || 0;
        appState.streakCount = stats[appState.currentMode].streak || 0;
        updateStatsDisplay();
    }

    function updateTimeDisplay() {
        const mins = Math.floor(appState.seconds / 60);
        const secs = appState.seconds % 60;
        const timeEl = document.getElementById('stat-time');
        if(timeEl) timeEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    // --- СЛУШАТЕЛИ СОБЫТИЙ ---
    if(hiddenInput) {
        hiddenInput.addEventListener('input', (e) => {
            if (!appState.isSessionActive || appState.currentMode !== 'orthography' || !appState.currentTask || appState.currentAppMode !== 'training') return;
            const char = e.target.value.slice(-1).toLowerCase();
            if (char && char.match(/[а-яё\-\s]/i)) handleOrthography(char);
            e.target.value = '';
        });

        hiddenInput.addEventListener('keydown', (e) => {
            if (!appState.isSessionActive || appState.currentMode !== 'orthography' || !appState.currentTask || appState.currentAppMode !== 'training') return;
            if (e.key === 'Backspace') handleOrthography('backspace');
            else if (e.key === ' ') { handleOrthography(' '); e.preventDefault(); }
        });
    }

    document.addEventListener('click', (e) => {
        const modeDropdown = document.getElementById('mode-dropdown');
        const modeButton = document.getElementById('menu-dropdown-button');
        if (modeButton && !modeButton.contains(e.target) && modeDropdown && !modeDropdown.contains(e.target)) {
            modeDropdown.classList.add('hidden');
        }

        const settingsDropdown = document.getElementById('settings-dropdown');
        const settingsButton = document.getElementById('settings-dropdown-button');
        if (settingsButton && settingsDropdown && !settingsButton.contains(e.target) && !settingsDropdown.contains(e.target)) {
            settingsDropdown.classList.add('hidden');
        }

        if (!e.target.closest('[id^="manage-menu-"]') && !e.target.closest('[onclick^="toggleManageMenu"]')) {
            document.querySelectorAll('[id^="manage-menu-"]').forEach(el => el.classList.add('hidden'));
        }

        if (appState.isSessionActive && appState.currentMode === 'orthography' && appState.currentAppMode === 'training' && !e.target.closest('button')) {
            if(hiddenInput) hiddenInput.focus();
        }
    });

    function bindEvents() {
        document.getElementById('menu-dropdown-button')?.addEventListener('click', () => document.getElementById('mode-dropdown').classList.toggle('hidden'));
        document.getElementById('settings-dropdown-button')?.addEventListener('click', () => document.getElementById('settings-dropdown').classList.toggle('hidden'));
        
        document.getElementById('menu-orthography')?.addEventListener('click', () => { switchAppMode('training'); switchMode('orthography'); });
        document.getElementById('menu-stress')?.addEventListener('click', () => { switchAppMode('training'); switchMode('stress'); });
        
        document.querySelectorAll('[data-level]').forEach(btn => btn.addEventListener('click', () => switchLevel(btn.dataset.level)));
        document.querySelectorAll('[data-profile-tab]').forEach(btn => btn.addEventListener('click', () => switchProfileTab(btn.dataset.profileTab)));
        
        document.getElementById('btn-random-levels')?.addEventListener('click', toggleRandomLevels);
        document.getElementById('profile-mode-button')?.addEventListener('click', () => switchAppMode('profile'));
        document.getElementById('start-session-button')?.addEventListener('click', startSession);
        document.getElementById('end-session-button')?.addEventListener('click', endSession);
        
        document.getElementById('theme-toggle')?.addEventListener('change', (e) => toggleTheme(e.target.checked));
        document.getElementById('keyboard-toggle')?.addEventListener('change', (e) => toggleKeyboardSetting(e.target.checked));
        
        // Обработка клавиатуры и ударений с фолбэками для id
        const orthKB = document.getElementById('orthography-keyboard') || document.getElementById('orthography-keyboard-container');
        orthKB?.addEventListener('click', (e) => { 
            const btn = e.target.closest('[data-key-input]'); 
            if (btn) handleOrthography(btn.dataset.keyInput); 
        });
        
        document.getElementById('word-container')?.addEventListener('click', (e) => { 
            const btn = e.target.closest('[data-stress-choice]'); 
            if (!btn) return; 
            handleStress(btn.dataset.stressChoice === 'correct', btn); 
        });
    }

    // Стало:
// --- ИНИЦИАЛИЗАЦИЯ ---
document.addEventListener('DOMContentLoaded', () => {
    // Теперь этот код выполнится только тогда, когда все кнопки точно появились в HTML
    toggleTheme(true);
    bindEvents();
    syncLevelPillsVisibility();
    updateManageCardBadges('orthography');
    updateManageCardBadges('stress');
    
    // Безопасный вызов switchMode без затирания, если DATA ещё грузится внешне
    if (typeof DATA !== 'undefined' && DATA.length > 0) {
        switchMode('orthography');
    }
    
    updateStatsDisplay();
    updateTimeDisplay();
});
