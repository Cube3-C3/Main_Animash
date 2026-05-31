  const appState = {
            mode: "training",
            gameMode: "orthography",
            currentTask: null,
            activeIndex: null, 
            indexPointer: 0,   
            sessionActive: false,
            sessionStart: null,
            solvedCount: 0,
            attemptsCount: 0,
            successCount: 0,
            streakCount: 0,
            seconds: 0,
            timerInterval: null,
            showKeyboard: false,
            isProcessingInput: false,
            isProcessingInput: false,        // Глобальная блокировка во время анимаций (600ms)
			inputBatchTimeout: null,         // Идентификатор 60ms окна тишины
			isMultiKeyPressDetected: false,  // Флаг фиксации нарушения (двойного клика)
			currentSlotRecorded: false,
			currentIndexSession: {
				taskId: null,
				index: null,
				firstTry: true,
				startedAt: 0
			},
			taskStartTime: 0,
			lastSuccessTime: 0
        };

        // LAYER 3: DOM MAP (Правка №5 — Полное кэширование DOM)
        const dom = {
            taskContainer: document.getElementById('task-container'),
            hiddenInput: document.getElementById('hidden-input'),
            feedbackArea: document.getElementById('feedback-area'),
            feedbackContainer: document.getElementById('feedback-container'),
            feedbackText: document.getElementById('feedback-text'),
            feedbackIcon: document.getElementById('feedback-icon'),
            keyboard: document.getElementById('virtual-keyboard'),
            instruction: document.getElementById('instruction-text'),
            startState: document.getElementById('start-state'),
            trainingState: document.getElementById('training-state'),
            sessionControls: document.getElementById('session-controls'),
            statSolved: document.getElementById('stat-solved'),
            statSuccess: document.getElementById('stat-success'),
            statStreak: document.getElementById('stat-streak'),
            statTime: document.getElementById('stat-time'),
            menuDropdownButton: document.getElementById('menu-dropdown-button'),
            modeDropdown: document.getElementById('mode-dropdown'),
            currentModeLabel: document.getElementById('current-mode-label'),
            settingsDropdownButton: document.getElementById('settings-dropdown-button'),
            settingsDropdown: document.getElementById('settings-dropdown'),
            startSessionButton: document.getElementById('start-session-button'),
            endSessionButton: document.getElementById('end-session-button'),
            themeToggle: document.getElementById('theme-toggle'),
            keyboardToggle: document.getElementById('keyboard-toggle'),
            modeTitle: document.getElementById('mode-title')
        };

        // LAYER 4: STORAGE (Правка №3 — Переименован в StatsManager)
        // LAYER 4: STORAGE (Обновлен с поддержкой Priority Engine)
	class StatsManager {
		constructor() { this.key = 'gorus_stats_v4'; }
		load() { return JSON.parse(localStorage.getItem(this.key) || '{}'); }
		save(data) { localStorage.setItem(this.key, JSON.stringify(data)); }
		
		completeIndex({ taskId, index, firstTry, timeSpent }) {
			const data = this.load();
			const statKey = `${taskId}:${index}`;
			if (!data[statKey]) data[statKey] = { attempts: 0, success: 0, totalTime: 0, streak: 0, lastSeen: 0 };
			
			data[statKey].attempts += 1;
			data[statKey].totalTime += timeSpent;
			data[statKey].lastSeen = Date.now();
			
			if (firstTry) {
				data[statKey].success += 1;
				data[statKey].streak += 1;
			} else {
				data[statKey].streak = 0;
			}
			this.save(data);
		}

		// НОВЫЙ МЕТОД: Расчет приоритета для конкретного индекса
		getPriority(taskId, index) {
			const data = this.load();
			const stat = data[`${taskId}:${index}`];

			// 1. Если статистики нет — индекс новый, назначаем высокий стартовый приоритет
			if (!stat || stat.attempts === 0) return 2.0; 

			// 2. Вычисление базовых метрик
			const successRate = stat.success / stat.attempts;
			// Ограничиваем влияние экстремальных задержек (максимум 15 секунд в формулу)
			const avgTime = Math.min(stat.totalTime / stat.attempts, 15);

			// 3. Итоговая формула приоритета
			return ((1 - successRate) * (1 + avgTime)) / (stat.streak + 1);
		}
	}
	const statsManager = new StatsManager();

        // LAYER 5: LOGIC / SESSION CONTROLLER (Правка №1 — Управление сессией и стейтом)
        const Session = {
            start() {
                appState.sessionActive = true;
                appState.solvedCount = 0;
                appState.attemptsCount = 0;
                appState.successCount = 0;
                appState.streakCount = 0;
                appState.seconds = 0;
                appState.sessionStart = Date.now();
                
                UI.toggleSessionView(true);
                UI.renderStats();
                this.nextTask();
				
				appState.currentSlotRecorded = false; 			

                appState.timerInterval = setInterval(() => {
                    appState.seconds++;
                    UI.renderTime(appState.seconds);
                }, 1000);
            },

            stop() {
                appState.sessionActive = false;
                clearInterval(appState.timerInterval);
                appState.currentTask = null;
                appState.currentIndexSession = this.createIndexSession(null, null);
                UI.toggleSessionView(false);
                UI.clearTask();
            },

			createIndexSession(taskId, index) {
				return {
					taskId,
					index,
					firstTry: true,
					startedAt: taskId === null || index === null ? 0 : performance.now()
				};
			},

			startIndexSession() {
				const task = appState.currentTask;
				appState.currentIndexSession = this.createIndexSession(task?.id ?? null, appState.activeIndex ?? null);
			},

			markIndexError(targetIdx) {
				const session = appState.currentIndexSession;
				if (!session || session.taskId !== appState.currentTask?.id || session.index !== targetIdx) {
					return;
				}
				session.firstTry = false;
			},

			completeCurrentIndex(targetIdx) {
				const session = appState.currentIndexSession;
				if (!session || session.taskId !== appState.currentTask?.id || session.index !== targetIdx) {
					return;
				}

				const timeSpent = (performance.now() - session.startedAt) / 1000;
				statsManager.completeIndex({
					taskId: session.taskId,
					index: session.index,
					firstTry: session.firstTry,
					timeSpent
				});

				appState.attemptsCount += 1;
				appState.solvedCount += 1;
				if (session.firstTry) {
					appState.successCount += 1;
					appState.streakCount += 1;
				} else {
					appState.streakCount = 0;
				}

				appState.currentIndexSession = this.createIndexSession(null, null);
				UI.renderStats();
			},

            // Внутри const Session = { ... } замените методы nextTask и nextIndex:

			// LAYER 5: LOGIC (Отбор с вероятностным выбором из Топ-5)
	nextTask() {
		const available = TaskRepository.filter(d => d.type === appState.gameMode);
		if (!available.length) { appState.currentTask = null; return; }
		
		// 1. Оцениваем все доступные задачи
		const scoredTasks = available.map(task => {
			// Считаем приоритеты для каждого проверяемого индекса
			const indexScores = task.index.map(idx => ({
				index: idx,
				priority: statsManager.getPriority(task.id, idx)
			}));

			// Сортируем индексы внутри задачи от самого сложного к простому
			indexScores.sort((a, b) => b.priority - a.priority);

			// 2. Отбор activeIndexes (Порог 0.3)
			let active = indexScores.filter(item => item.priority > 0.3); // 

			// Гарантия наличия задания: если всё выучено, берем 1 индекс с максимальным приоритетом
			if (active.length === 0 && indexScores.length > 0) {
				active = [indexScores[0]]; // [cite: 120]
			}

			// --- НОВАЯ ЛОГИКА: Вероятностный выбор из Топ-5 индексов ---
			// Берем до 5 самых сложных индексов, перемешиваем этот топ-5
			// и оставляем максимум 3 слота на задачу.
			active = active
				.slice(0, 5)
				.sort(() => Math.random() - 0.5)
				.slice(0, 3);

			// Сортируем отобранные индексы обратно по возрастанию, чтобы визуально решать их слева направо
			active.sort((a, b) => a.index - b.index);

			const activeIndexes = active.map(a => a.index);
			
			// Приоритет самой задачи равен максимальному приоритету её активных индексов
			const taskPriority = active.length > 0 ? Math.max(...active.map(a => a.priority)) : 0;

			return { ...task, activeIndexes, taskPriority };
		});

		// 3. Сортируем задачи по приоритету (самые сложные — первые)
		scoredTasks.sort((a, b) => b.taskPriority - a.taskPriority);

		// --- НОВАЯ ЛОГИКА: Вероятностный выбор из Топ-5 задач ---
		// Чтобы не было предсказуемости, берем топ-5 самых сложных задач
		const top5Tasks = scoredTasks.slice(0, 5);
		
		// Выбираем случайную задачу из пула проблемных
		appState.currentTask = top5Tasks[Math.floor(Math.random() * top5Tasks.length)];
		appState.indexPointer = 0;
		appState.activeIndex = appState.currentTask.activeIndexes[0];
		appState.currentSlotRecorded = false; // Сбрасываем при новом задании
		this.startIndexSession();
		
		UI.renderTask();
	},
	nextIndex() {
                appState.indexPointer++;
                const t = appState.currentTask;
                
                if (appState.indexPointer < t.activeIndexes.length) {
                    appState.currentSlotRecorded = false;
			
			const prevActiveIndex = appState.activeIndex;
			appState.activeIndex = t.activeIndexes[appState.indexPointer];
			this.startIndexSession();
			
			UI.shiftActiveSlot(prevActiveIndex, appState.activeIndex);
		} else {
			// Задание решено. НЕ сбрасываем currentSlotRecorded, 
			// чтобы заблокировать фантомные нажатия в пустом окне ожидания!
			setTimeout(() => {
				if (appState.sessionActive && appState.indexPointer >= t.activeIndexes.length) {
					this.nextTask();
				}
			}, 400);
		}
	},

        };
	const PUNCTUATION_WEIGHTS = {
				',': 'light',
				'.': 'light',
				'!': 'light',
				'?': 'light',
				';': 'light',
				':': 'light',

				'—': 'wide',
				'-': 'wide',

				' ': 'space',

				default: 'normal'
	};

	function getCharWeight(char) {
				return PUNCTUATION_WEIGHTS[char] || 'normal';
	};
        // LAYER 6: UI RENDERER (Правка №2 — Изолированный чистый рендер)
        const UI = {
			
            renderTask() {
                dom.taskContainer.innerHTML = '';
                dom.feedbackArea.classList.add('opacity-0');
                appState.isProcessingInput = false;

                const t = appState.currentTask;
                if (!t) return;

                this.renderInstruction(t.type);

                if (t.type === 'orthography' || t.type === 'punctuation') {
                    this.renderInteractiveText(t);
                    this.renderKeyboard();
                    dom.hiddenInput.focus();
                } else if (t.type === 'stress') {
                    this.renderStressText(t);
                    dom.keyboard.style.display = 'none';
                }
                
                appState.taskStartTime = performance.now();
            },
			showOptimisticInput(target, char, isCorrect, type) {
				if (type === 'stress') return; 
				const slot = document.getElementById(`slot-${target}`);
				if (slot) {
					const displayChar = char === ' ' ? '\u00A0' : (char === '' ? '∅' : char);
					slot.textContent = displayChar;
					slot.classList.remove('empty', 'active', 'error', 'resolved');
					slot.classList.add(isCorrect ? 'resolved' : 'error');
				}
			},

			// Визуальное наказание за спам клавишами
			showCheatWarning(target, type) {
				if (type === 'stress') return;
				const slot = document.getElementById(`slot-${target}`);
				if (slot) {
					slot.textContent = '❌'; 
					slot.classList.remove('empty', 'active', 'resolved');
					slot.classList.add('error');
				}
			},
            renderInstruction(type) {
                if (type === 'orthography') dom.instruction.textContent = 'введите пропущенную букву';
                else if (type === 'punctuation') dom.instruction.textContent = 'введите знак препинания (или пробел/пустоту)';
                else if (type === 'stress') dom.instruction.textContent = 'кликните по ударной гласной';
            },
			
			renderInteractiveText(task) {
				const wrapper = document.createElement('div');
				wrapper.className = 'task-wrapper';
				
				task.content.forEach((realChar, i) => {
					// Проверяем, тестируется ли вообще этот индекс в этом задании
					if (task.index.includes(i)) {
						const span = document.createElement('span');
						span.id = `slot-${i}`;
						const expectedChar = realChar;
						const weightClass = `weight-${getCharWeight(expectedChar)}`;
						
						// Проверяем, попал ли индекс в текущий активный раунд (Priority Engine)
						if (task.activeIndexes.includes(i)) {
							const internalIdx = task.activeIndexes.indexOf(i);

							if (i === appState.activeIndex) {
								// Активный проблемный слот
								span.className = `gap-slot empty active ${weightClass}`;
								span.dataset.expected = expectedChar;
								span.textContent = '\u00A0';
							} 
							else if (internalIdx > appState.indexPointer) {
								// Еще не дошли до него
								span.className = `gap-slot empty inactive ${weightClass}`;
								span.textContent = '\u00A0';
							} 
							else {
								// Уже решен в рамках этого раунда
								span.className = `gap-slot resolved ${weightClass}`;
								span.textContent = expectedChar === ' ' ? '\u00A0' : (expectedChar || '\u00A0');
							}
						} else {
							// Индекс освоен (priority <= 0.3) -> выводим сразу как раскрытый
							span.className = `gap-slot resolved ${weightClass}`;
							span.textContent = expectedChar === ' ' ? '\u00A0' : (expectedChar || '\u00A0');
						}
						
						wrapper.appendChild(span);					
					} else {
						const span = document.createElement('span');
						span.className = 'text-part';
						span.textContent = realChar; 
						wrapper.appendChild(span);
					}
				});
				
				dom.taskContainer.appendChild(wrapper);
			},
            renderStressText(task) {
				const wrapper = document.createElement('div');
				wrapper.className = 'task-wrapper';
				const vowels = 'аеёиоуыэюяАЕЁИОУЫЭЮЯ';
				
				task.content.forEach((char, i) => {
					if (vowels.includes(char)) {
						const btn = document.createElement('button');
						btn.className = 'vowel-button';
						btn.textContent = char;
						btn.dataset.index = i;                    // Добавили
						btn.onclick = () => handleInput(i);       // Уже было, но теперь надёжнее
						wrapper.appendChild(btn);
					} else {
						const span = document.createElement('span');
						span.className = 'text-part';
						span.textContent = char;
						wrapper.appendChild(span);
					}
				});
				dom.taskContainer.appendChild(wrapper);
			},

            renderKeyboard() {
                if (!appState.showKeyboard || appState.gameMode === 'stress') {
                    dom.keyboard.style.display = 'none';
                    return;
                }
                dom.keyboard.style.display = 'flex';
                
                const layout = [
                    ['й','ц','у','к','е','н','г','ш','щ','з','х','ъ'],
                    ['ф','ы','в','а','п','р','о','л','д','ж','э'],
                    ['я','ч','с','м','и','т','ь','б','ю',',','.','-'],
                    ['space', 'none']
                ];
                dom.keyboard.innerHTML = '';
                layout.forEach(row => {
                    const rowDiv = document.createElement('div');
                    rowDiv.className = 'flex justify-center gap-1.5 w-full';
                    row.forEach(key => {
                        const b = document.createElement('button');
                        if (key === 'space') { b.className='keyboard-key-wide'; b.innerText='пробел'; b.onclick = () => handleInput(' '); }
                        else if (key === 'none') { b.className='keyboard-key w-16 text-xs'; b.innerText='пусто'; b.onclick = () => handleInput(''); }
                        else { b.className='keyboard-key'; b.innerText=key; b.onclick = () => handleInput(key); }
                        rowDiv.appendChild(b);
                    });
                    dom.keyboard.appendChild(rowDiv);
                });
            },

            renderFeedback(isSuccess) {
                if (isSuccess) {
                    dom.feedbackContainer.className = "text-success font-ui-label flex items-center gap-2 bg-success/10 px-6 py-2 rounded-full border border-success/20";
                    dom.feedbackIcon.textContent = "check_circle"; dom.feedbackText.textContent = "верно!";
                } else {
                    dom.feedbackContainer.className = "text-error font-ui-label flex items-center gap-2 bg-error/10 px-6 py-2 rounded-full border border-error/20";
                    dom.feedbackIcon.textContent = "error"; dom.feedbackText.textContent = "ошибка!";
                }
                dom.feedbackArea.classList.remove('opacity-0');
            },

            renderStats() {
                dom.statSolved.textContent = appState.solvedCount;
                dom.statStreak.textContent = appState.streakCount;
                dom.statSuccess.textContent = appState.attemptsCount ? Math.round((appState.successCount / appState.attemptsCount) * 100) + '%' : '0%';
            },

            renderTime(seconds) {
                const m = Math.floor(seconds / 60).toString().padStart(2, '0');
                const s = (seconds % 60).toString().padStart(2, '0');
                dom.statTime.textContent = `${m}:${s}`;
            },

            toggleSessionView(start) {
                dom.startState.classList.toggle('hidden', start);
                dom.trainingState.classList.toggle('hidden', !start);
                dom.sessionControls.classList.toggle('invisible', !start);
            },

            clearTask() {
                dom.taskContainer.innerHTML = '';
                dom.instruction.textContent = '';
                dom.statTime.textContent = '00:00';
            },
			// Добавить внутрь объекта UI:

			shiftActiveSlot(oldIdx, newIdx) {
				if (appState.currentTask?.type === 'stress') return; // В режиме stress разметка статична

				// Снимаем активность со старого слота (если он еще не скрылся)
				const oldSlot = document.getElementById(`slot-${oldIdx}`);
				if (oldSlot && !oldSlot.classList.contains('resolved')) {
					oldSlot.classList.remove('active');
				}
				// Вешаем активность на новый слот
				const newSlot = document.getElementById(`slot-${newIdx}`);
				if (newSlot) {
					newSlot.classList.remove('inactive');
					newSlot.classList.add('active');
				}
			},

			animateSuccess(idx, expectedVal, onComplete) {
				const t = appState.currentTask;
				if (t.type === 'stress') {
					const btn = document.querySelector(`.vowel-button[data-index="${idx}"]`);
					if (btn) {
						btn.classList.remove('error');
						btn.classList.add('correct');
					}
					// Вызываем коллбэк сразу для мгновенного перехода, анимация доиграет сама
					onComplete(); 
				} else {
					const slot = document.getElementById(`slot-${idx}`);
					if (slot) {
						const weight = getCharWeight(expectedVal);
						// Слот изолированно переходит в состояние resolved
						slot.className = `gap-slot resolved weight-${weight}`;
						slot.textContent = expectedVal === ' ' ? '\u00A0' : expectedVal;
					}
					onComplete(); // Мгновенно освобождаем поток для следующего ввода
				}
			},

			animateError(target, wrongChar, onComplete) {
				const t = appState.currentTask;
				if (t.type === 'stress') {
					const btn = document.querySelector(`.vowel-button[data-index="${target}"]`);
					if (btn) btn.classList.add('error');
					
					setTimeout(() => {
						if (btn) btn.classList.remove('error');
						onComplete(); // Разрешаем повторный ввод на этой же позиции через 400мс
					}, 400);
				} else {
					const slot = document.getElementById(`slot-${target}`);
					if (slot) {
						const expectedChar = slot.dataset.expected || t.content[target];
						const weightClass = `weight-${getCharWeight(expectedChar)}`;

						slot.textContent = wrongChar === ' ' ? '␣' : (wrongChar === '' ? '∅' : wrongChar);
						slot.classList.remove('empty', 'active', 'resolved');
						slot.classList.add('error');
						
						setTimeout(() => {
							// Если за время анимации ошибки фокус не ушел на другой слот
							const isStillCurrent = (appState.activeIndex === target);
							slot.textContent = '';
							slot.className = `gap-slot empty ${isStillCurrent ? 'active' : 'inactive'} ${weightClass}`;
							onComplete();
						}, 500); // Время фиксации ошибки на экране
					}
				}
			}
        };
		// LAYER 7: INPUT HANDLER (Асинхронный конвейер с жесткой защитой)
	function handleInput(inputValue) {
		if (!appState.sessionActive) return;

		// 1. Аппаратный анти-дребезг: защищаем следующий слот от случайного двойного нажатия
		// Если с момента прошлого успешного ответа прошло менее 100мс — игнорируем «шлейф» клавиши
		const now = performance.now();
		if (now - (appState.lastSuccessTime || 0) < 100) return;

		const t = appState.currentTask;
		let targetIdx = appState.activeIndex;
		
		if (targetIdx === null || targetIdx === undefined) return;

		let isCorrect = false;
		let expected = "";

		if (t.type === 'stress') {
			// ВАЖНОЕ ИСПРАВЛЕНИЕ: targetIdx (для статистики) всегда остается = activeIndex.
			// Мы тестируем только позицию ударения (t.index[0]), а не случайную нажатую букву!
			expected = t.index[0];
			isCorrect = (inputValue === expected);
		} else {
			expected = t.content[targetIdx];
			isCorrect = (inputValue.toLowerCase() === expected.toLowerCase());
		}

		if (!isCorrect) {
			Session.markIndexError(targetIdx);
		}

		// --- УМНЫЙ АНТИСПАМ ---
		if (appState.inputBatchTimeout) {
			if (isCorrect) {
				clearTimeout(appState.inputBatchTimeout);
				appState.inputBatchTimeout = null;
				appState.isMultiKeyPressDetected = false;
			} else {
				appState.isMultiKeyPressDetected = true;
				UI.showCheatWarning(t.type === 'stress' ? inputValue : targetIdx, t.type);
				return;
			}
		}

		// Рендерим визуальный эффект немедленно
		UI.showOptimisticInput(t.type === 'stress' ? inputValue : targetIdx, inputValue, isCorrect, t.type);

		appState.inputBatchTimeout = setTimeout(() => {
			appState.inputBatchTimeout = null;
			// Если зафиксирован спам неверными клавишами
			if (appState.isMultiKeyPressDetected) {
				Session.markIndexError(targetIdx);
				UI.renderFeedback(false);
				UI.animateError(t.type === 'stress' ? inputValue : targetIdx, '❌', () => {
					dom.hiddenInput.value = '';
				});
				return;
			}

			if (isCorrect) {
				Session.completeCurrentIndex(targetIdx);
			} else {
				Session.markIndexError(targetIdx);
			}
			
			UI.renderFeedback(isCorrect);

			if (isCorrect) {
				// Засекаем время успеха, чтобы заблокировать "протечки" в следующий слот
				appState.lastSuccessTime = performance.now(); 
				
				UI.animateSuccess(t.type === 'stress' ? inputValue : targetIdx, expected, () => {
					if (t.type !== 'stress') {
						Session.nextIndex();
					} else {
						setTimeout(() => Session.nextTask(), 300);
					}
				});
			} else {
				UI.animateError(t.type === 'stress' ? inputValue : targetIdx, inputValue, () => {
					dom.hiddenInput.value = '';
				});
			}
		}, 30);
	};
	
        // LAYER 8: EVENT LISTENERS (Привязка к DOM картам)
        dom.hiddenInput.addEventListener('input', (e) => {
            const char = e.target.value.slice(-1);
            if (char) handleInput(char);
            e.target.value = '';
        });

        dom.hiddenInput.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace') { handleInput(''); e.preventDefault(); }
            if (e.key === ' ') { handleInput(' '); e.preventDefault(); }
            if (appState.currentTask?.type === 'punctuation' && [',', '.', '!', ':', ';', '-'].includes(e.key)) {
                handleInput(e.key); e.preventDefault();
            }
        });

        document.addEventListener('click', (e) => {
            if (appState.sessionActive && appState.currentTask?.type !== 'stress' && !e.target.closest('button')) dom.hiddenInput.focus();
        });

        document.querySelectorAll('.menu-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                appState.gameMode = e.target.dataset.mode;
                dom.currentModeLabel.textContent = e.target.textContent;
                dom.modeDropdown.classList.add('hidden');
                
                if (appState.sessionActive) Session.stop();
                dom.modeTitle.textContent = `Тренировка: ${e.target.textContent}`;
                UI.renderKeyboard();
            });
        });

        dom.menuDropdownButton.addEventListener('click', () => dom.modeDropdown.classList.toggle('hidden'));
        dom.settingsDropdownButton.addEventListener('click', () => dom.settingsDropdown.classList.toggle('hidden'));
        dom.startSessionButton.addEventListener('click', () => Session.start());
        dom.endSessionButton.addEventListener('click', () => Session.stop());
        dom.themeToggle.addEventListener('change', e => document.documentElement.classList.toggle('dark', e.target.checked));
        
        dom.keyboardToggle.addEventListener('change', e => {
            appState.showKeyboard = e.target.checked;
            UI.renderKeyboard();
        });
