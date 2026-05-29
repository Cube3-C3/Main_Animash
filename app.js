
class StatsManager {
    constructor() {
        this.storageKey = 'gorus_unified_index_stats_v3';
    }

    loadData() {
        try {
            const raw = localStorage.getItem(this.storageKey);
            return raw ? JSON.parse(raw) || {} : {};
        } catch (e) {
            console.error("Ошибка загрузки статистики:", e);
            return {};
        }
    }

    saveData(data) {
        localStorage.setItem(this.storageKey, JSON.stringify(data));
    }

    getWordKey(word) {
        return Array.isArray(word) ? word.join(' ').toUpperCase() : String(word).toUpperCase();
    }

    // Сохранение логов строго по конкретному индексу
    updateStat(word, type, lvl, targetIndex, isSuccess, timeSec) {
        const wordKey = this.getWordKey(word);
        const data = this.loadData();

        if (!data[wordKey]) data[wordKey] = { word: wordKey, stats: {} };
        if (!data[wordKey].stats[type]) data[wordKey].stats[type] = {};
        if (!data[wordKey].stats[type][lvl]) data[wordKey].stats[type][lvl] = {};

        if (!data[wordKey].stats[type][lvl][targetIndex]) {
            data[wordKey].stats[type][lvl][targetIndex] = { attempts: 0, success: 0, totalTime: 0, streak: 0 };
        }

        const node = data[wordKey].stats[type][lvl][targetIndex];
        node.attempts += 1;
        if (isSuccess) {
            node.success += 1;
            node.streak = (node.streak || 0) + 1;
        } else {
            node.streak = 0;
        }
        node.totalTime += timeSec;

        this.saveData(data);
    }

    // Универсальный выбор задачи на основе слабых индексов
    getPriorityTask(mode, lvl, multiSlotMode) {
        const data = this.loadData();
        let pool = DATA.filter(item => item.type === mode && item.Lvl === lvl);
        if (pool.length === 0) pool = DATA.filter(item => item.type === mode);
        if (pool.length === 0) return null;

        const candidates = [];

        pool.forEach(item => {
            const wordKey = this.getWordKey(item.word);
            const wordStats = data[wordKey]?.stats?.[mode]?.[item.Lvl] || {};
            const itemIndices = item.index; // Единый массив индексов

            if (!multiSlotMode) {
                // Режим "Один слабый индекс": ищем худший индекс внутри текущего слова
                let worstIndex = itemIndices[0];
                let maxPriority = -1;

                itemIndices.forEach(idx => {
                    const saved = wordStats[idx];
                    let prio = 1000; // Базовый высокий приоритет для новых элементов
                    if (saved && saved.attempts > 0) {
                        const rate = saved.success / saved.attempts;
                        const avgTime = saved.totalTime / saved.attempts;
                        prio = ((1 - rate) * avgTime / Math.log(saved.attempts + 1)) * Math.pow(0.5, saved.streak || 0);
                    }
                    if (prio > maxPriority) {
                        maxPriority = prio;
                        worstIndex = idx;
                    }
                });
                candidates.push({ item, targetIndexes: [worstIndex], priority: maxPriority });
            } else {
                // Многослотовый режим: считаем средний приоритет по всем индексам слова
                let totalPrio = 0;
                itemIndices.forEach(idx => {
                    const saved = wordStats[idx];
                    if (!saved || saved.attempts === 0) totalPrio += 1000;
                    else {
                        const rate = saved.success / saved.attempts;
                        const avgTime = saved.totalTime / saved.attempts;
                        totalPrio += ((1 - rate) * avgTime / Math.log(saved.attempts + 1)) * Math.pow(0.5, saved.streak || 0);
                    }
                });
                candidates.push({ item, targetIndexes: itemIndices, priority: totalPrio / itemIndices.length });
            }
        });

        // Сортируем и выбираем случайное из ТОП-3 худших для избежания циклов
        candidates.sort((a, b) => b.priority - a.priority);
        const topPool = candidates.slice(0, Math.min(3, candidates.length));
        return topPool[Math.floor(Math.random() * topPool.length)];
    }
}

// --- УНИФИЦИРОВАННЫЙ ЕДИНЫЙ UI ДВИЖОК ---
const UI = {
    statsManager: new StatsManager(),
    
    state: {
        appMode: 'profile',       
        gameMode: 'punctuation',   
        session: 'idle',           
        currentLevel: 'sentence',      
        profileTab: 'stats',
        
        // Внутреннее динамическое состояние текущей сессии
        currentTask: null,
        targetIndexes: [],  // Индексы, которые подлежат вводу в текущем раунде
        activeSlotId: null, // Текущий выделенный слот
        slotsData: [],      // Метаданные активных слотов [{index, expectedChar}]
        mistakesInWord: 0,
        wordStartTime: 0,
        multiSlotMode: false 
    },

    init() {
        this.bindEvents();
        this.bindKeyboardInterceptors();
        this.updateView();
        this.renderKeyboard();
    },

    setState(newState) {
        Object.assign(this.state, newState);
        this.updateView();
    },

    syncModeInDropdown() {
        const buttons = document.querySelectorAll('#mode-dropdown button');
        buttons.forEach(btn => {
            const checkIcon = btn.querySelector('.material-symbols-outlined');
            const isActive = (this.state.appMode !== 'profile') && (btn.dataset.mode === this.state.gameMode);
            
            if (isActive) {
                btn.classList.add('menu-item-active');
                if (checkIcon) checkIcon.classList.remove('hidden');
            } else {
                btn.classList.remove('menu-item-active');
                if (checkIcon) checkIcon.classList.add('hidden');
            }
        });
    },

    syncStatsWithManagement() {
        const disciplines = ['orthography', 'stress', 'punctuation'];
        disciplines.forEach(disc => {
            const normalized = disc.substring(0, 5) === 'ortho' ? 'ortho' : disc.substring(0, 6) === 'stress' ? 'stress' : 'punctuation';
            const mgmtCard = document.getElementById(`mgmt-${normalized}`);
            const statsCard = document.getElementById(`stats-${normalized}`);
            if (!mgmtCard || !statsCard) return;

            const activeLevels = Array.from(mgmtCard.querySelectorAll('.toggle-level.active'))
                .map(btn => btn.dataset.level);

            const statsGrid = statsCard.querySelector('.grid');
            if(!statsGrid) return;
            const levelElements = statsGrid.querySelectorAll('[data-level]');
            
            let hasVisibleLevel = false;
            levelElements.forEach(el => {
                if (activeLevels.includes(el.dataset.level)) {
                    el.classList.remove('hidden');
                    hasVisibleLevel = true;
                } else {
                    el.classList.add('hidden');
                }
            });

            statsCard.classList.toggle('hidden', !hasVisibleLevel);
        });

        const rawContainer = document.getElementById('profile-stats-raw');
        if (rawContainer && this.state.appMode === 'profile') {
            rawContainer.textContent = JSON.stringify(this.statsManager.loadData(), null, 2);
        }
    },

    updateView() {
        document.body.setAttribute('data-app-mode', this.state.appMode);
        document.body.setAttribute('data-game-mode', this.state.gameMode);
        document.body.setAttribute('data-session', this.state.session);

        const titleEl = document.getElementById('mode-title');
        const labelEl = document.getElementById('current-mode-label');
        
        if (this.state.appMode === 'profile') {
            if(labelEl) labelEl.textContent = 'Профиль';
            if(titleEl) titleEl.textContent = 'Ваш прогресс';
        } else {
            const modeNames = {
                'orthography': 'Орфография',
                'stress': 'Ударение',
                'punctuation': 'Пунктуация'
            };
            if(labelEl) labelEl.textContent = modeNames[this.state.gameMode];
            if(titleEl) titleEl.textContent = `Тренировка: ${modeNames[this.state.gameMode].toLowerCase()}`;
        }

        this.syncModeInDropdown();

        if (this.state.appMode === 'profile') {
            document.getElementById('nav-pills-training')?.classList.add('hidden');
            document.getElementById('nav-pills-profile')?.classList.remove('hidden');
            document.getElementById('start-state')?.classList.add('hidden');
            document.getElementById('training-state')?.classList.add('hidden');
            document.getElementById('profile-state')?.classList.remove('hidden');
            document.getElementById('session-controls')?.classList.add('invisible');
            
            const isStats = this.state.profileTab === 'stats';
            document.getElementById('tab-stats-content')?.classList.toggle('hidden', !isStats);
            document.getElementById('tab-management-content')?.classList.toggle('hidden', isStats);
            
            if(isStats) this.syncStatsWithManagement();
        } else {
            document.getElementById('nav-pills-training')?.classList.remove('hidden');
            document.getElementById('nav-pills-profile')?.classList.add('hidden');
            document.getElementById('profile-state')?.classList.add('hidden');

            if (this.state.session === 'active') {
                document.getElementById('start-state')?.classList.add('hidden');
                document.getElementById('training-state')?.classList.remove('hidden');
                document.getElementById('session-controls')?.classList.remove('invisible');
            } else {
                document.getElementById('start-state')?.classList.remove('hidden');
                document.getElementById('training-state')?.classList.add('hidden');
                document.getElementById('session-controls')?.classList.add('invisible');
            }
            
            this.syncNavLevelsWithManagement();
        }

        const kbContainer = document.getElementById('keyboard-fixed-container');
        const kbToggle = document.getElementById('keyboard-toggle');
        const showKeyboard = (this.state.gameMode === 'orthography' || this.state.gameMode === 'punctuation') && 
                            kbToggle?.checked && 
                            this.state.session === 'active' && 
                            this.state.appMode === 'training';

        if (kbContainer) {
            if (showKeyboard) {
                kbContainer.classList.remove('translate-y-full');
                this.renderKeyboard(); 
            } else {
                kbContainer.classList.add('translate-y-full');
            }
        }

        this.focusHiddenInput();
    },

    syncNavLevelsWithManagement() {
        const normalized = this.state.gameMode === 'orthography' ? 'ortho' : this.state.gameMode === 'stress' ? 'stress' : 'punctuation';
        const mgmtContainer = document.getElementById(`mgmt-${normalized}`);
        if (!mgmtContainer) return;

        const activeManagementLevels = Array.from(mgmtContainer.querySelectorAll('.toggle-level.active'))
            .map(btn => btn.dataset.level);

        const navPills = document.querySelectorAll('#nav-pills-training .level-button');
        let firstVisible = null;
        let isCurrentStillVisible = false;

        navPills.forEach(pill => {
            const level = pill.dataset.level;
            if (activeManagementLevels.includes(level)) {
                pill.classList.remove('hidden');
                if (!firstVisible) firstVisible = level;
                if (level === this.state.currentLevel) isCurrentStillVisible = true;
            } else {
                pill.classList.add('hidden');
            }
        });

        if (!isCurrentStillVisible && firstVisible) {
            this.state.currentLevel = firstVisible;
        }

        this.syncActiveLevelPill();
    },

    syncActiveLevelPill() {
        document.querySelectorAll('.level-button').forEach(btn => {
            btn.classList.remove('bg-primary', 'text-white', 'shadow-sm');
            btn.classList.add('text-text-muted', 'dark:text-surface-variant');
        });
        const activeBtn = document.getElementById(`level-${this.state.currentLevel}`);
        if (activeBtn) {
            activeBtn.classList.add('bg-primary', 'text-white', 'shadow-sm');
            activeBtn.classList.remove('text-text-muted', 'dark:text-surface-variant');
        }
    },

    focusHiddenInput() {
        const inp = document.getElementById('hidden-input');
        if (inp && this.state.session === 'active' && this.state.appMode === 'training' && this.state.gameMode !== 'stress') {
            setTimeout(() => inp.focus(), 60);
        }
    },

    // --- УНИВЕРСАЛЬНЫЙ СИНТАКСИЧЕСКИЙ И ГРАФИЧЕСКИЙ РЕНДЕР ЗАДАЧ ---
    startMockTask() {
        const container = document.getElementById('word-container');
        const instruction = document.getElementById('instruction-text');
        if (!container || !instruction) return;

        container.innerHTML = '';
        
        // Получаем оптимальную задачу на основе анализа ошибок
        const taskPack = this.statsManager.getPriorityTask(this.state.gameMode, this.state.currentLevel, this.state.multiSlotMode);
        
        if (!taskPack) {
            instruction.textContent = 'Нет доступных заданий для этого уровня.';
            container.innerHTML = `<span class="text-xl text-text-muted">Активируйте уровни в настройках конфигурации</span>`;
            return;
        }

        this.state.currentTask = taskPack.item;
        this.state.targetIndexes = taskPack.targetIndexes;
        this.state.mistakesInWord = 0;
        this.state.slotsData = [];
        this.state.wordStartTime = performance.now();

        const item = this.state.currentTask;

        // --- УНИФИЦИРОВАННЫЙ РЕНДЕР: ПУНКТУАЦИЯ ---
        if (this.state.gameMode === 'punctuation') {
            instruction.textContent = 'расставьте знаки препинания (пробел = нет знака)';
            container.className = 'font-word-display text-primary dark:text-primary-fixed flex items-center justify-center gap-x-1 gap-y-3 tracking-wider select-none whitespace-normal break-words px-2 leading-relaxed w-full mx-auto flex-wrap text-2xl md:text-4xl';

            for (let i = 0; i < item.gaps.length; i++) {
                const isTarget = this.state.targetIndexes.includes(i);
                const expectedValue = item.gaps[i] === null ? ' ' : item.gaps[i];

                if (isTarget) {
                    this.state.slotsData.push({ index: i, expectedChar: expectedValue });

                    const btn = document.createElement('button');
                    btn.className = 'punct-slot min-w-[1.5ch] h-10 border-b-4 border-primary/40 dark:border-inverse-primary/40 hover:border-primary transition-all mx-1 font-bold text-center outline-none bg-primary/5 rounded-t px-1';
                    btn.id = `punct-gap-${i}`;
                    btn.dataset.slotIndex = i;
                    container.appendChild(btn);
                } else {
                    if (item.gaps[i] !== null) {
                        const staticSign = document.createElement('span');
                        staticSign.className = 'text-text-muted font-bold opacity-80 mx-0.5';
                        staticSign.textContent = item.gaps[i];
                        container.appendChild(staticSign);
                    }
                }

                if (i < item.word.length) {
                    const wordSpan = document.createElement('span');
                    wordSpan.className = 'mx-1 text-on-surface dark:text-neutral-200';
                    wordSpan.textContent = item.word[i];
                    container.appendChild(wordSpan);
                }
            }

            if (this.state.slotsData.length > 0) this.setActiveSlot(this.state.slotsData[0].index);
        } 
        // --- УНИФИЦИРОВАННЫЙ РЕНДЕР: ОРФОГРАФИЯ ---
        else if (this.state.gameMode === 'orthography') {
            instruction.textContent = 'введите пропущенную букву';
            container.className = 'font-word-display text-primary dark:text-primary-fixed text-4xl md:text-6xl tracking-widest font-bold select-none';

            item.word.split('').forEach((ch, idx) => {
                const isTarget = this.state.targetIndexes.includes(idx);
                if (isTarget) {
                    // Символ извлекается напрямую из слова по индексу — больше никаких вариантов!
                    this.state.slotsData.push({ index: idx, expectedChar: ch.toLowerCase() });

                    const slotSpan = document.createElement('span');
                    slotSpan.className = 'ortho-slot ortho-empty inline-block w-[1.2ch] border-b-4 border-primary dark:border-inverse-primary mx-0.5 text-center transition-all';
                    slotSpan.id = `ortho-gap-${idx}`;
                    slotSpan.dataset.slotIndex = idx;
                    container.appendChild(slotSpan);
                } else {
                    const plainSpan = document.createElement('span');
                    plainSpan.className = 'text-on-surface dark:text-neutral-200';
                    plainSpan.textContent = ch;
                    container.appendChild(plainSpan);
                }
            });

            if (this.state.slotsData.length > 0) this.setActiveSlot(this.state.slotsData[0].index);
        } 
        // --- УНИФИЦИРОВАННЫЙ РЕНДЕР: УДАРЕНИЯ ---
        else if (this.state.gameMode === 'stress') {
            instruction.textContent = 'кликните по ударной гласной';
            container.className = 'font-word-display text-primary dark:text-primary-fixed text-4xl md:text-6xl tracking-wide select-none';

            item.word.split('').forEach((ch, idx) => {
                if ('аеёиоуыэюя'.includes(ch.toLowerCase())) {
                    const btn = document.createElement('button');
                    btn.className = 'vowel-button px-0.5 cursor-pointer font-extrabold text-primary dark:text-inverse-primary hover:scale-110 active:scale-95 transition-transform outline-none';
                    btn.textContent = ch;
                    // Проверяем, совпадает ли текущий индекс гласной с целевым индексом ударения
                    btn.dataset.stressChoice = item.index.includes(idx) ? 'correct' : 'wrong';
                    btn.dataset.index = idx;
                    container.appendChild(btn);
                } else {
                    const span = document.createElement('span');
                    span.className = 'text-on-surface dark:text-neutral-400';
                    span.textContent = ch;
                    container.appendChild(span);
                }
            });
        }
        
        this.focusHiddenInput();
    },

    setActiveSlot(index) {
        this.state.activeSlotId = index;
        
        document.querySelectorAll('.punct-slot, .ortho-slot').forEach(el => {
            el.classList.remove('bg-primary/20', 'border-primary', 'ring-2', 'ring-primary/30');
        });

        const activeEl = document.getElementById(`${this.state.gameMode === 'punctuation' ? 'punct' : 'ortho'}-gap-${index}`);
        if (activeEl) {
            activeEl.classList.add('bg-primary/20', 'border-primary', 'ring-2', 'ring-primary/30');
        }
    },

    // --- УНИВЕРСАЛЬНАЯ ВАЛИДАЦИЯ И ОБРАБОТКА ВВОДА ---
    handleMockInput(char) {
        if (this.state.session !== 'active' || this.state.appMode !== 'training') return;
        
        const activeSlotId = this.state.activeSlotId;
        if (activeSlotId === null) return;

        const currentSlot = this.state.slotsData.find(s => s.index === activeSlotId);
        if (!currentSlot) return;

        const elId = `${this.state.gameMode === 'punctuation' ? 'punct' : 'ortho'}-gap-${activeSlotId}`;
        const slotEl = document.getElementById(elId);
        if (!slotEl) return;

        const expected = currentSlot.expectedChar;
        const normalizedInput = char.toLowerCase();

        if (normalizedInput === 'backspace') {
            slotEl.textContent = '';
            slotEl.classList.remove('text-success', 'text-red-500', 'font-bold');
            return;
        }

        if (normalizedInput === expected) {
            // Успешный ввод символа в слот
            slotEl.textContent = expected === ' ' ? '—' : char; 
            slotEl.classList.remove('text-red-500');
            slotEl.classList.add('text-success', 'font-bold');
            
            const timeSec = (performance.now() - this.state.wordStartTime) / 1000;
            
            // Запись лога строго по конкретному текущему индексу!
            this.statsManager.updateStat(
                this.state.currentTask.word,
                this.state.gameMode,
                this.state.currentLevel,
                activeSlotId,
                this.state.mistakesInWord === 0,
                timeSec
            );

            this.showFeedback(true, "верно!");

            // Убираем решенный индекс из оперативного буфера раунда
            this.state.slotsData = this.state.slotsData.filter(s => s.index !== activeSlotId);
            
            slotEl.classList.remove('punct-slot', 'ortho-slot');
            slotEl.style.pointerEvents = 'none';

            if (this.state.slotsData.length > 0) {
                // Переходим к следующему незаполненному индексу этого слова
                this.setActiveSlot(this.state.slotsData[0].index);
                this.state.wordStartTime = performance.now(); 
            } else {
                this.state.activeSlotId = null;
                setTimeout(() => this.startMockTask(), 800);
            }
        } else {
            // Ошибка при вводе
            this.state.mistakesInWord++;
            slotEl.textContent = char === ' ' ? '␣' : char;
            slotEl.classList.add('text-red-500', 'font-bold');
            this.showFeedback(false, "ошибка!");

            setTimeout(() => {
                if (this.state.activeSlotId === activeSlotId) {
                    slotEl.textContent = '';
                    slotEl.classList.remove('text-red-500');
                }
            }, 500);
        }
    },

    bindEvents() {
        document.addEventListener('click', e => {
            const t = e.target;

            if (t.closest('#menu-dropdown-button')) {
                document.getElementById('mode-dropdown').classList.toggle('hidden');
                return;
            }
            if (t.closest('#settings-dropdown-button')) {
                document.getElementById('settings-dropdown').classList.toggle('hidden');
                return;
            }

            if (!t.closest('#menu-dropdown-button') && !t.closest('#mode-dropdown')) {
                document.getElementById('mode-dropdown')?.classList.add('hidden');
            }
            if (!t.closest('#settings-dropdown-button') && !t.closest('#settings-dropdown')) {
                document.getElementById('settings-dropdown')?.classList.add('hidden');
            }

            if (t.closest('#menu-orthography')) {
                this.setState({ gameMode: 'orthography', appMode: 'training' });
            }
            if (t.closest('#menu-stress')) {
                this.setState({ gameMode: 'stress', appMode: 'training' });
            }
            if (t.closest('#menu-punctuation')) {
                this.setState({ gameMode: 'punctuation', appMode: 'training' });
            }

            if (t.closest('#profile-mode-button')) {
                this.setState({ appMode: 'profile' });
            }

            if (t.closest('.level-button')) {
                const btn = t.closest('.level-button');
                this.state.currentLevel = btn.dataset.level;
                this.syncActiveLevelPill();
                if (this.state.session === 'active') this.startMockTask();
            }

            if (t.closest('.profile-nav-button')) {
                const btn = t.closest('.profile-nav-button');
                document.querySelectorAll('.profile-nav-button').forEach(b => b.classList.remove('bg-primary', 'text-white', 'shadow-sm'));
                btn.classList.add('bg-primary', 'text-white', 'shadow-sm');
                this.state.profileTab = btn.dataset.profileTab;
                this.updateView();
            }

            if (t.id === 'start-session-button') {
                this.setState({ session: 'active' });
                this.startMockTask();
            }
            if (t.id === 'end-session-button' || t.closest('#end-session-button')) {
                this.setState({ session: 'idle' });
            }

            const key = t.closest('.keyboard-key-btn');
            if (key && this.state.session === 'active') {
                this.handleMockInput(key.dataset.key);
            }

            const vowel = t.closest('.vowel-button');
            if (vowel && this.state.session === 'active') {
                const isCorrect = vowel.dataset.stressChoice === 'correct';
                this.handleStress(isCorrect, vowel);
            }

            // Ручное переключение текущего редактируемого индекса при клике мышкой
            const targetSlot = t.closest('.punct-slot, .ortho-slot');
            if (targetSlot && this.state.session === 'active') {
                this.setActiveSlot(parseInt(targetSlot.dataset.slotIndex, 10));
            }

            if (t.closest('.toggle-level')) {
                const btn = t.closest('.toggle-level');
                btn.classList.toggle('active');
                btn.classList.toggle('inactive');
                this.syncStatsWithManagement();
            }
        });

        document.getElementById('theme-toggle')?.addEventListener('change', e => {
            document.documentElement.classList.toggle('dark', e.target.checked);
        });

        document.getElementById('keyboard-toggle')?.addEventListener('change', () => {
            this.updateView();
        });

        document.getElementById('multi-input-toggle')?.addEventListener('change', e => {
            this.state.multiSlotMode = e.target.checked;
            if (this.state.session === 'active') this.startMockTask();
        });
    },

    bindKeyboardInterceptors() {
        const hiddenInput = document.getElementById('hidden-input');
        if (!hiddenInput) return;

        document.addEventListener('click', (e) => {
            if (this.state.session === 'active' && this.state.appMode === 'training' && !e.target.closest('button, input, select')) {
                this.focusHiddenInput();
            }
        });

        hiddenInput.addEventListener('input', (e) => {
            const rawVal = e.target.value;
            if (!rawVal) return;
            const char = rawVal.charAt(rawVal.length - 1);
            
            if (this.state.gameMode === 'orthography' && char.match(/[а-яё\-]/i)) {
                this.handleMockInput(char);
            } else if (this.state.gameMode === 'punctuation' && char.match(/[\(\)«»—:,;\.!?\s"']/i)) {
                this.handleMockInput(char);
            }
            hiddenInput.value = ''; 
        });

        hiddenInput.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace') {
                this.handleMockInput('backspace');
            } else if (e.key === 'Spacebar' || e.key === ' ') {
                e.preventDefault();
                this.handleMockInput(' ');
            }
        });
    },

    handleStress(correct, element) {
        if (!this.state.currentTask) return;
        const timeSec = (performance.now() - this.state.wordStartTime) / 1000;
        const targetIndex = parseInt(element.dataset.index, 10);

        if (correct) {
            if(!element.textContent.includes('\u0301')) {
                element.textContent = element.textContent + '\u0301';
            }
            element.classList.add('correct');
            this.showFeedback(true, "ударение верно!");

            // Сохраняем в статистику по конкретному индексу ударения
            this.statsManager.updateStat(
                this.state.currentTask.word,
                'stress',
                this.state.currentLevel,
                targetIndex,
                this.state.mistakesInWord === 0,
                timeSec
            );

            setTimeout(() => this.startMockTask(), 1000);
        } else {
            this.state.mistakesInWord++;
            element.classList.add('wrong');
            this.showFeedback(false, "ошибка!");
            setTimeout(() => element.classList.remove('wrong'), 400);
        }
    },

    renderKeyboard() {
        const virtualKb = document.getElementById('virtual-keyboard');
        if (!virtualKb) return;
        virtualKb.innerHTML = '';
        
        let layout = [];
        if (this.state.gameMode === 'punctuation') {
            layout = [
                ['(', ')', '«', '»', '—', ':', ',', ';'],
                ['.', '!', '?', '…', 'пробел']
            ];
        } else {
            layout = [
                ['й','ц','у','к','е','н','г','ш','щ','з','х','ъ'],
                ['ф','ы','в','а','п','р','о','л','д','ж','э','ё'],
                ['-','я','ч','с','м','и','т','ь','б','ю','⌫'],
                ['пробел']
            ];
        }

        layout.forEach(row => {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'flex gap-1 md:gap-1.5 justify-center w-full';
            row.forEach(char => {
                const btn = document.createElement('button');
                btn.className = 'keyboard-key-btn flex items-center justify-center bg-gray-100 dark:bg-neutral-800 border border-gray-300 dark:border-neutral-700 rounded-lg text-sm font-semibold hover:bg-gray-200 dark:hover:bg-neutral-700 active:scale-95 transition-all select-none text-on-surface dark:text-inverse-on-surface';
                btn.style.height = '51px';
                
                if (char === '⌫') { 
                    btn.classList.add('w-14', 'text-red-500'); 
                    btn.dataset.key = 'backspace'; 
                } else if (char === 'пробел') { 
                    btn.classList.add('w-64'); 
                    btn.dataset.key = ' '; 
                } else {
                    btn.classList.add('w-10');
                    btn.dataset.key = char;
                }
                
                btn.textContent = char;
                rowDiv.appendChild(btn);
            });
            virtualKb.appendChild(rowDiv);
        });
    },

    showFeedback(success, text) {
        const area = document.getElementById('feedback-area');
        const container = document.getElementById('feedback-container');
        const icon = document.getElementById('feedback-icon');
        const textEl = document.getElementById('feedback-text');
        if(!area || !container || !icon || !textEl) return;

        textEl.textContent = text;
        icon.textContent = success ? 'check_circle' : 'error';
        container.className = success 
            ? "text-success font-semibold flex items-center gap-2 bg-success/10 px-6 py-2 rounded-full border border-success/20"
            : "text-red-400 font-semibold flex items-center gap-2 bg-red-500/10 px-6 py-2 rounded-full border border-red-500/20";
        area.classList.remove('opacity-0');
        setTimeout(() => area.classList.add('opacity-0'), 1800);
    }
};

document.addEventListener('DOMContentLoaded', () => UI.init());
