/**
 * Auto-Matrix 控制台版 v1.7
 * 
 * 使用方法：
 *   1. 打开 https://matrix.sysu.edu.cn/ 任意题目页面
 *   2. F12 打开开发者工具 → Console（控制台）
 *   3. 复制本文件全部内容，粘贴到控制台并回车
 *   4. 右上角出现配置面板，填入 API Key 后点击"开始自动做题"
 * 
 * 注意：刷新页面后需重新粘贴运行。
 */

(function() {
    'use strict';

    // 防重复注入
    if (document.getElementById('am-api-url')) {
        console.warn('[Auto-Matrix] 脚本已注入，跳过重复执行');
        return;
    }

    // ==================== 用户配置 ====================
    const CONFIG = {
        apiUrl: 'https://api.deepseek.com/v1/chat/completions',
        apiKey: '',
        model: 'deepseek-v4-flash',
        systemPrompt: `你是一个编程助手。请根据题目描述和提供的文件内容，完成可编辑的文件。
规则：
1. 使用要求的编程语言。
2. 只输出需要修改的文件，不能修改只读文件。
3. 输出格式：每个文件用代码块包裹，并标注文件名，例如：
\`\`\`cpp main.cpp
你的代码
\`\`\`
4. 如果只有一个可编辑文件，可以直接输出代码，但最好也标注文件名。
5. 不要输出多余的解释，只输出代码块。`,
        maxRetries: 5,
        disableThinking: true,
    };

    const savedConfig = JSON.parse(localStorage.getItem('auto_matrix_config') || '{}');
    Object.assign(CONFIG, savedConfig);

    function saveConfig() {
        localStorage.setItem('auto_matrix_config', JSON.stringify({
            apiUrl: CONFIG.apiUrl,
            apiKey: CONFIG.apiKey,
            model: CONFIG.model,
            systemPrompt: CONFIG.systemPrompt,
            maxRetries: CONFIG.maxRetries,
            disableThinking: CONFIG.disableThinking,
        }));
    }

    // ==================== UI 面板 ====================
    function createUI() {
        const style = document.createElement('style');
        style.textContent = `
            .auto-matrix-panel {
                position: fixed; top: 20px; right: 20px; z-index: 99999;
                background: #fff; border: 2px solid #1890ff; border-radius: 8px;
                padding: 15px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                width: 320px; font-family: sans-serif; font-size: 14px;
                display: flex; flex-direction: column; gap: 8px;
            }
            .auto-matrix-panel h3 { margin: 0 0 5px; font-size: 16px; color: #1890ff; }
            .auto-matrix-panel label { display: flex; flex-direction: column; font-size: 12px; color: #555; }
            .auto-matrix-panel input, .auto-matrix-panel textarea {
                margin-top: 3px; padding: 5px; border: 1px solid #ccc; border-radius: 4px; font-size: 12px;
            }
            .auto-matrix-panel textarea { resize: vertical; height: 60px; }
            .auto-matrix-panel button {
                padding: 6px 12px; background: #1890ff; color: #fff; border: none;
                border-radius: 4px; cursor: pointer; font-weight: bold; transition: background 0.2s;
            }
            .auto-matrix-panel button:hover { background: #0c7cd5; }
            .auto-matrix-panel button.stop { background: #ff4d4f; }
            .auto-matrix-panel .status { font-size: 13px; color: #555; min-height: 18px; }
            .auto-matrix-panel .checkbox-row {
                display: flex; align-items: center; gap: 6px; font-size: 12px; color: #555;
            }
            .auto-matrix-panel .checkbox-row input[type="checkbox"] { margin: 0; }
        `;
        document.head.appendChild(style);

        const panel = document.createElement('div');
        panel.className = 'auto-matrix-panel';
        panel.innerHTML = `
            <h3>🤖 自动做题</h3>
            <label>API 地址
                <input type="text" id="am-api-url" value="${CONFIG.apiUrl}">
            </label>
            <label>API Key
                <input type="password" id="am-api-key" value="${CONFIG.apiKey}" placeholder="sk-...">
            </label>
            <label>模型
                <input type="text" id="am-model" value="${CONFIG.model}">
            </label>
            <label>系统提示词
                <textarea id="am-system-prompt">${CONFIG.systemPrompt}</textarea>
            </label>
            <label>最大重试次数
                <input type="number" id="am-max-retries" value="${CONFIG.maxRetries}" min="1" max="10">
            </label>
            <div class="checkbox-row">
                <input type="checkbox" id="am-disable-thinking" ${CONFIG.disableThinking ? 'checked' : ''}>
                <label for="am-disable-thinking" style="display:inline; margin:0;">禁用深度思考（仅 DeepSeek 有效）</label>
            </div>
            <div style="display:flex; gap:8px;">
                <button id="am-start-btn">开始自动做题</button>
                <button id="am-stop-btn" class="stop" style="display:none;">停止</button>
            </div>
            <div class="status" id="am-status"></div>
        `;
        document.body.appendChild(panel);

        document.getElementById('am-api-url').addEventListener('change', e => { CONFIG.apiUrl = e.target.value; saveConfig(); });
        document.getElementById('am-api-key').addEventListener('change', e => { CONFIG.apiKey = e.target.value; saveConfig(); });
        document.getElementById('am-model').addEventListener('change', e => { CONFIG.model = e.target.value; saveConfig(); });
        document.getElementById('am-system-prompt').addEventListener('change', e => { CONFIG.systemPrompt = e.target.value; saveConfig(); });
        document.getElementById('am-max-retries').addEventListener('change', e => { CONFIG.maxRetries = parseInt(e.target.value) || 5; saveConfig(); });
        document.getElementById('am-disable-thinking').addEventListener('change', e => { CONFIG.disableThinking = e.target.checked; saveConfig(); });

        let running = false;
        const startBtn = document.getElementById('am-start-btn');
        const stopBtn = document.getElementById('am-stop-btn');
        const statusDiv = document.getElementById('am-status');

        function setStatus(msg) { statusDiv.textContent = msg; }

        startBtn.addEventListener('click', async () => {
            if (running) return;
            running = true;
            startBtn.style.display = 'none';
            stopBtn.style.display = 'inline-block';
            setStatus('⏳ 开始执行...');
            document.querySelectorAll('.auto-matrix-panel input, .auto-matrix-panel textarea').forEach(el => el.disabled = true);
            try {
                await mainLoop(setStatus, () => running);
            } catch (err) {
                setStatus('❌ 脚本异常: ' + err.message);
                console.error(err);
            } finally {
                running = false;
                startBtn.style.display = 'inline-block';
                stopBtn.style.display = 'none';
                document.querySelectorAll('.auto-matrix-panel input, .auto-matrix-panel textarea').forEach(el => el.disabled = false);
                const cur = statusDiv.textContent;
                if (!cur.startsWith('❌') && !cur.startsWith('⏹️')) setStatus('⏹️ 已停止');
            }
        });

        stopBtn.addEventListener('click', () => { running = false; setStatus('⏳ 正在停止...'); });
    }

    // ==================== 工具函数 ====================
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function getQuestionDescription() {
        const el = document.querySelector('.assignment-info-card matrix-md > div');
        if (!el) throw new Error('未找到题目描述元素');
        return el.innerText.trim();
    }

    function getTabsFromDOM() {
        const tabs = [];
        const tabContainer = document.querySelector('.topbar ul');
        if (!tabContainer) return tabs;
        const tabElements = tabContainer.querySelectorAll('li');
        tabElements.forEach(tab => {
            const container = tab.querySelector('div > div');
            if (!container) return;
            const name = container.textContent.trim();
            const lockIcon = container.querySelector('i > svg');
            tabs.push({ name, readOnly: !!lockIcon, element: container });
        });
        console.log('[getTabsFromDOM] 找到', tabs.length, '个文件:', tabs.map(t => `${t.name}(${t.readOnly?'只读':'可编辑'})`));
        return tabs;
    }

    async function loadAllFiles() {
        if (typeof monaco === 'undefined' || !monaco.editor) throw new Error('Monaco 编辑器未加载');

        const tabs = getTabsFromDOM();
        if (tabs.length === 0) throw new Error('未找到文件标签');

        for (const tab of tabs) {
            tab.element.click();
            await sleep(200);
        }

        const models = monaco.editor.getModels();
        const editors = monaco.editor.getEditors();
        console.log('[loadAllFiles] Monaco 中有', models.length, '个 model');

        const files = [];
        const usedModelIndices = new Set();

        for (const tab of tabs) {
            let model = null;
            let editor = null;

            for (let i = 0; i < models.length; i++) {
                if (usedModelIndices.has(i)) continue;
                const uriName = models[i].uri.path.split('/').pop();
                if (uriName === tab.name || tab.name.includes(uriName) || (uriName && uriName.includes(tab.name))) {
                    model = models[i];
                    usedModelIndices.add(i);
                    break;
                }
            }

            if (!model) {
                for (let i = 0; i < models.length; i++) {
                    if (!usedModelIndices.has(i)) {
                        model = models[i];
                        usedModelIndices.add(i);
                        break;
                    }
                }
            }

            if (model) {
                editor = editors.find(e => e.getModel() === model) || null;
                files.push({
                    name: tab.name,
                    content: model.getValue(),
                    readOnly: tab.readOnly,
                    language: model.getLanguageId ? model.getLanguageId() : 'plaintext',
                    model,
                    editor
                });
                console.log(`[loadAllFiles]   ${tab.name} (${tab.readOnly?'只读':'可编辑'}) - ${model.getValue().length} 字符`);
            } else {
                console.warn(`[loadAllFiles]   未找到 ${tab.name} 对应的 model`);
            }
        }

        const firstEditable = files.find(f => !f.readOnly);
        if (firstEditable) {
            const targetTab = tabs.find(t => t.name === firstEditable.name);
            if (targetTab) {
                targetTab.element.click();
                await sleep(100);
                console.log('[loadAllFiles] 切回可编辑文件:', firstEditable.name);
            }
        }

        console.log('[loadAllFiles] 最终收集到', files.length, '个文件');
        return files;
    }

    function getLanguageFromFiles(files) {
        const extMap = { '.cpp': 'C++', '.c': 'C', '.py': 'Python', '.java': 'Java', '.js': 'JavaScript', '.ts': 'TypeScript', '.go': 'Go', '.rs': 'Rust', '.rb': 'Ruby', '.php': 'PHP', '.cs': 'C#', '.swift': 'Swift', '.kt': 'Kotlin' };
        for (const f of files) {
            const ext = '.' + f.name.split('.').pop().toLowerCase();
            if (extMap[ext]) return extMap[ext];
        }
        return '编程语言';
    }

    function triggerEditorChange(file) {
        if (file.model) {
            try {
                const fullRange = file.model.getFullModelRange();
                file.model.emit('change', { changes: [{ range: fullRange, rangeLength: file.model.getValueLength(), text: file.model.getValue(), rangeOffset: 0, forceMoveMarkers: false }], eol: file.model.getEOL(), versionId: file.model.getVersionId(), isUndoing: false, isRedoing: false, isFlush: false });
            } catch (e) {}
        }
        const editorDom = document.querySelector('.monaco-editor');
        if (editorDom) {
            ['input', 'change'].forEach(type => editorDom.dispatchEvent(new Event(type, { bubbles: true })));
        }
        const textareas = document.querySelectorAll('.monaco-editor textarea, .inputarea');
        textareas.forEach(ta => ['input', 'change'].forEach(type => ta.dispatchEvent(new Event(type, { bubbles: true }))));
        if (file.editor && typeof file.editor.focus === 'function') {
            try {
                file.editor.focus();
                setTimeout(() => { if (file.editor) { file.editor.trigger('keyboard', 'cursorHome', null); file.editor.trigger('keyboard', 'cursorEnd', null); } }, 50);
            } catch (e) {}
        }
    }

    async function applyCodeBlocks(codeBlocks, files) {
        const applied = [];
        for (const block of codeBlocks) {
            let targetFile = null;
            if (block.filename) {
                targetFile = files.find(f => f.name === block.filename);
                if (targetFile && targetFile.readOnly) {
                    console.warn(`[applyCodeBlocks] 文件 ${block.filename} 只读，跳过`);
                    continue;
                }
                if (!targetFile) {
                    console.warn(`[applyCodeBlocks] 未找到文件 "${block.filename}"，将降级使用第一个可编辑文件`);
                }
            }
            if (!targetFile) {
                targetFile = files.find(f => !f.readOnly);
            }
            if (!targetFile) {
                console.warn(`[applyCodeBlocks] 找不到可编辑文件：${block.filename || '无文件名'}`);
                continue;
            }

            const tabs = getTabsFromDOM();
            const targetTab = tabs.find(t => t.name === targetFile.name);
            if (targetTab) {
                targetTab.element.click();
                await sleep(150);
                console.log(`[applyCodeBlocks] 已切换到 tab: ${targetFile.name}`);
            }

            console.log(`[applyCodeBlocks] 尝试写入文件: ${targetFile.name}, 代码长度: ${block.code.length}`);

            let success = false;

            if (targetFile.editor && typeof targetFile.editor.executeEdits === 'function') {
                try {
                    const model = targetFile.editor.getModel();
                    const fullRange = model.getFullModelRange();
                    targetFile.editor.executeEdits('auto-solver', [{ range: fullRange, text: block.code, forceMoveMarkers: true }]);
                    success = true;
                    console.log(`[applyCodeBlocks] ✅ 通过 executeEdits 写入 ${targetFile.name}`);
                } catch (e) {
                    console.warn(`[applyCodeBlocks] executeEdits 失败:`, e.message);
                }
            }

            if (!success && targetFile.model) {
                try {
                    const model = targetFile.model;
                    const fullRange = model.getFullModelRange();
                    model.pushEditOperations([], [{ range: fullRange, text: block.code }], () => null);
                    success = true;
                    console.log(`[applyCodeBlocks] ✅ 通过 pushEditOperations 写入 ${targetFile.name}`);
                } catch (e) {
                    console.warn(`[applyCodeBlocks] pushEditOperations 失败:`, e.message);
                }
            }

            if (!success && targetFile.model) {
                try {
                    targetFile.model.setValue('');
                    targetFile.model.setValue(block.code);
                    success = true;
                    console.log(`[applyCodeBlocks] ✅ 通过 setValue 写入 ${targetFile.name}`);
                } catch (e) {
                    console.warn(`[applyCodeBlocks] setValue 失败:`, e.message);
                }
            }

            if (!success && targetFile.editor) {
                try {
                    targetFile.editor.trigger('keyboard', 'editor.action.selectAll', null);
                    targetFile.editor.trigger('keyboard', 'type', { text: block.code });
                    success = true;
                    console.log(`[applyCodeBlocks] ✅ 通过 keyboard type 写入 ${targetFile.name}`);
                } catch (e) {
                    console.warn(`[applyCodeBlocks] keyboard type 失败:`, e.message);
                }
            }

            if (success) {
                triggerEditorChange(targetFile);
                applied.push(block.filename || targetFile.name);
            } else {
                console.error(`[applyCodeBlocks] ❌ 所有写入方法均失败，文件: ${targetFile.name}`);
            }
        }

        if (applied.length === 0 && codeBlocks.length > 0) {
            const editable = files.find(f => !f.readOnly);
            if (editable && editable.model) {
                try {
                    editable.model.setValue(codeBlocks[0].code || '');
                    triggerEditorChange(editable);
                    applied.push(editable.name);
                    console.log(`[applyCodeBlocks] ✅ fallback setValue 写入 ${editable.name}`);
                } catch (e) {
                    console.error(`[applyCodeBlocks] ❌ fallback 也失败了:`, e.message);
                }
            }
        }

        console.log(`[applyCodeBlocks] 最终应用文件列表:`, applied);
        return applied;
    }

    async function clickSubmit() {
        const btn = document.querySelector('.playground-actions > div > button');
        if (!btn) throw new Error('未找到提交按钮');
        let checks = 0;
        while (btn.disabled && checks < 50) { await sleep(100); checks++; }
        if (btn.disabled) throw new Error('提交按钮一直被禁用');
        btn.click();
    }

    function clickNext() {
        const btn = document.querySelector('.tab-bottom-button-wrapper button:nth-child(3)');
        if (!btn) throw new Error('未找到下一题按钮');
        if (btn.disabled) throw new Error('下一题按钮不可用');
        btn.click();
    }

    function getScore() {
        const el = document.querySelector('.progress-middle');
        if (!el) return -1;
        const m = el.innerText.trim().match(/(\d+)/);
        return m ? parseInt(m[1]) : -1;
    }

    function getErrorInfo() {
        const parts = [];
        
        const compileErrorPane = document.querySelector('.ant-tabs-tabpane-active > div');
        if (compileErrorPane && compileErrorPane.innerText.trim()) {
            parts.push('【评测反馈】\n' + compileErrorPane.innerText.trim());
        }
        
        const alertDescription = document.querySelector('.case-problem .ant-alert-description');
        if (alertDescription && alertDescription.innerText.trim()) {
            const alertText = alertDescription.innerText.trim();
            if (!parts.some(p => p.includes(alertText))) parts.push('【编译错误】\n' + alertText);
        }
        
        if (parts.length === 0) {
            const reportContainer = document.querySelector('matrix-report');
            if (reportContainer && reportContainer.innerText.trim()) parts.push('【评测结果】\n' + reportContainer.innerText.trim());
        }
        
        if (parts.length === 0) {
            const allTabPanes = document.querySelectorAll('.ant-tabs-tabpane');
            allTabPanes.forEach(pane => {
                const text = pane.innerText.trim();
                if (text && text.length > 5) parts.push('【标签页内容】\n' + text);
            });
        }
        
        const result = parts.join('\n\n---\n\n');
        console.log('[getErrorInfo] 获取错误信息长度:', result.length, '字符');
        return result || null;
    }

    async function waitForResult() {
        let attempts = 0;
        while (attempts < 60) {
            const scoreEl = document.querySelector('.progress-middle');
            if (scoreEl && scoreEl.innerText.trim()) break;
            const compilePane = document.querySelector('.ant-tabs-tabpane-active > div');
            if (compilePane && compilePane.innerText.trim().length > 10) break;
            await sleep(500);
            attempts++;
        }
        if (attempts >= 60) throw new Error('提交结果等待超时');

        await sleep(2000);
        
        let errorText = '';
        for (let i = 0; i < 5; i++) {
            errorText = getErrorInfo() || '';
            if (errorText.length > 50) break;
            await sleep(500);
        }
        
        const score = getScore();
        
        if (score === 100) return { success: true, score: 100, error: null };
        
        if (errorText) return { success: false, score, error: errorText };
        
        return { success: false, score, error: `得分 ${score}，未达到满分，未获取到具体错误信息` };
    }

    // ==================== LLM 调用 ====================
    async function callLLM(messages) {
        console.log('[callLLM] 发送消息数量:', messages.length);
        console.log('[callLLM] ========== 发送给 LLM 的完整消息 ==========');
        messages.forEach((msg, i) => {
            console.log(`[callLLM] --- 消息 ${i + 1}/${messages.length} [${msg.role}] ---`);
            console.log(msg.content);
        });
        console.log('[callLLM] ========== 消息输出结束 ==========');
        
        const bodyObj = { model: CONFIG.model, messages, temperature: 0.2 };
        if (CONFIG.apiUrl.includes('deepseek.com') && CONFIG.disableThinking) {
            bodyObj.thinking = { type: 'disabled' };
        }
        
        const resp = await fetch(CONFIG.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CONFIG.apiKey}` },
            body: JSON.stringify(bodyObj)
        });
        
        if (!resp.ok) throw new Error(`LLM API 错误 ${resp.status}: ${await resp.text()}`);
        
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error('LLM 返回内容为空');
        
        console.log('[callLLM] LLM 返回内容长度:', content.length, '字符');
        console.log('[callLLM] ========== LLM 完整输出 ==========');
        console.log(content);
        console.log('[callLLM] ========== LLM 输出结束 ==========');
        
        return content;
    }

    function parseCodeBlocks(text) {
        const blocks = [];
        const regex = /```(\w*)\s*(\S*)[^\S\n]*\n([\s\S]*?)```/g;
        let m;
        while ((m = regex.exec(text)) !== null) {
            const filename = m[2] || null;
            const code = m[3].trim();
            blocks.push({ filename, code });
            console.log(`[parseCodeBlocks] 解析: filename="${filename || '(无)'}", code 长度=${code.length}`);
        }
        console.log(`[parseCodeBlocks] 共解析到 ${blocks.length} 个代码块`);
        return blocks;
    }

    // ==================== 选择题模式 ====================
    const CHOICE_SYSTEM_PROMPT = `你是一个选择题答题助手。请根据题目和选项，选择正确答案。
规则：
1. 仔细阅读题目和所有选项，选出唯一正确的答案。
2. 输出格式：每行一个答案，格式为"题号:选项字母"，例如：
1:A
2:C
3:B
4:D
3. 不要输出任何解释，只输出答案。`;

    function detectQuestionType() {
        if (document.querySelector('assignment-choice')) return 'choice';
        if (document.querySelector('assignment-program')) return 'program';
        return 'program';
    }

    function getChoiceQuestions() {
        const questions = [];
        const activePane = document.querySelector('.ant-tabs-tabpane-active');
        if (!activePane) return questions;

        const cards = activePane.querySelectorAll(':scope > div > div > nz-card');
        if (cards.length === 0) {
            const allCards = activePane.querySelectorAll('nz-card');
            allCards.forEach((card, idx) => {
                const body = card.querySelector('.ant-card-body');
                if (!body || body.querySelector('nz-collapse')) return;
                const question = extractQuestionFromCard(card, idx);
                if (question) questions.push(question);
            });
        } else {
            cards.forEach((card, idx) => {
                const question = extractQuestionFromCard(card, idx);
                if (question) questions.push(question);
            });
        }

        console.log('[getChoiceQuestions] 提取到', questions.length, '道题');
        return questions;
    }

    function extractQuestionFromCard(card, idx) {
        const body = card.querySelector('.ant-card-body');
        if (!body) return null;

        const radioGroup = body.querySelector('nz-radio-group');
        if (!radioGroup) return null;

        let stem = '';
        for (const node of body.childNodes) {
            if (node === radioGroup || (node.nodeType === 1 && node.querySelector('nz-radio-group'))) break;
            stem += node.textContent || '';
        }
        stem = stem.trim();

        const options = [];
        const labels = radioGroup.querySelectorAll(':scope > div label');
        labels.forEach(label => {
            const input = label.querySelector('input[type="radio"]');
            const text = label.innerText.trim();
            options.push({ letter: text.charAt(0), text, input });
        });

        const result = { index: idx + 1, stem, options };
        console.log(`[extractQuestionFromCard] 题目 ${idx + 1}: "${stem.substring(0, 50)}..." 选项:`, options.map(o => o.letter));
        return result;
    }

    function clickChoiceOption(questionIndex, optionLetter) {
        const letterIndex = optionLetter.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0) + 1;
        const activePane = document.querySelector('.ant-tabs-tabpane-active');
        if (!activePane) return false;

        const cards = activePane.querySelectorAll(':scope > div > div > nz-card');
        const card = cards[questionIndex - 1];
        if (!card) return false;

        const input = card.querySelector(
            `.ant-card-body nz-radio-group > div:nth-child(${letterIndex}) label input[type="radio"]`
        );
        if (input) {
            input.click();
            console.log(`[clickChoiceOption] 点击题目 ${questionIndex} 选项 ${optionLetter}`);
            return true;
        }
        console.warn(`[clickChoiceOption] 未找到题目 ${questionIndex} 选项 ${optionLetter}`);
        return false;
    }

    function hasNextChoicePage() {
        const nextBtn = document.querySelector('.ant-tabs-tabpane-active li.ant-pagination-next:not(.ant-pagination-disabled)');
        return !!nextBtn;
    }

    function goToNextChoicePage() {
        const nextBtn = document.querySelector('.ant-tabs-tabpane-active li.ant-pagination-next:not(.ant-pagination-disabled) button');
        if (!nextBtn) throw new Error('没有下一页');
        nextBtn.click();
    }

    function submitChoices() {
        const activePane = document.querySelector('.ant-tabs-tabpane-active');
        if (!activePane) throw new Error('未找到活跃面板');
        const btn = activePane.querySelector(':scope > div > button');
        if (!btn) throw new Error('未找到选择题提交按钮');
        btn.click();
    }

    function parseChoiceAnswers(text) {
        const answers = new Map();
        const regex = /(\d+)\s*[:：]\s*([A-Da-d])/g;
        let m;
        while ((m = regex.exec(text)) !== null) {
            answers.set(parseInt(m[1]), m[2].toUpperCase());
        }
        console.log('[parseChoiceAnswers] 解析结果:', [...answers.entries()].map(([k,v]) => `${k}:${v}`).join(', '));
        return answers;
    }

    async function choiceMainLoop(setStatus, isRunning) {
        setStatus('📋 选择题模式');

        const choiceTab = document.querySelector('assignment-choice nz-header ul li:nth-child(2)');
        if (choiceTab) {
            choiceTab.click();
            await sleep(500);
        }

        const conversationHistory = [
            { role: 'system', content: CHOICE_SYSTEM_PROMPT }
        ];
        let globalQuestionIndex = 0;

        while (isRunning()) {
            let waitAttempts = 0;
            while (true) {
                const cards = document.querySelectorAll('.ant-tabs-tabpane-active nz-card');
                if (cards.length > 0) break;
                if (!isRunning()) { setStatus('⏹️ 用户停止'); return; }
                if (waitAttempts > 30) { setStatus('❌ 选择题加载超时'); return; }
                await sleep(500);
                waitAttempts++;
            }

            const questions = getChoiceQuestions();
            if (questions.length === 0) { setStatus('❌ 未找到选择题'); return; }

            let questionText = '';
            for (const q of questions) {
                const qNum = globalQuestionIndex + q.index;
                questionText += `题目 ${qNum}：${q.stem}\n`;
                for (const opt of q.options) {
                    questionText += `${opt.letter}. ${opt.text}\n`;
                }
                questionText += '\n';
            }

            setStatus(`🤖 正在答题 (第 ${globalQuestionIndex + 1}-${globalQuestionIndex + questions.length} 题)...`);

            conversationHistory.push({ role: 'user', content: questionText });
            let llmResponse;
            try {
                llmResponse = await callLLM(conversationHistory);
            } catch (e) { setStatus('❌ LLM 调用失败：' + e.message); return; }
            conversationHistory.push({ role: 'assistant', content: llmResponse });

            const answers = parseChoiceAnswers(llmResponse);

            for (const q of questions) {
                if (!isRunning()) return;
                const qNum = globalQuestionIndex + q.index;
                const answer = answers.get(qNum);
                if (answer) {
                    clickChoiceOption(q.index, answer);
                    await sleep(150);
                } else {
                    console.warn(`[choiceMainLoop] 未找到题目 ${qNum} 的答案`);
                }
            }

            globalQuestionIndex += questions.length;

            if (hasNextChoicePage()) {
                setStatus(`➡️ 翻到下一页 (已完成 ${globalQuestionIndex} 题)...`);
                goToNextChoicePage();
                await sleep(1000);
            } else {
                setStatus('📤 全部答完，提交...');
                try {
                    submitChoices();
                    setStatus('✅ 选择题已提交');
                } catch (e) { setStatus('❌ 提交失败：' + e.message); }
                return;
            }
        }
    }

    // ==================== 主循环（入口） ====================
    async function mainLoop(setStatus, isRunning) {
        setStatus('⏳ 检测题目类型...');
        await sleep(1000);

        const qType = detectQuestionType();
        console.log('[mainLoop] 检测到题目类型:', qType);

        if (qType === 'choice') {
            setStatus('📋 选择题模式');
            await choiceMainLoop(setStatus, isRunning);
        } else {
            setStatus('💻 编程题模式');
            await programMainLoop(setStatus, isRunning);
        }
    }

    // ==================== 编程题主循环 ====================
    async function programMainLoop(setStatus, isRunning) {
        setStatus('⏳ 等待题目加载...');
        const questionSelector = '.assignment-info-card matrix-md > div';
        let waitAttempts = 0;
        while (!document.querySelector(questionSelector)) {
            if (!isRunning()) { setStatus('⏹️ 用户停止'); return; }
            if (waitAttempts > 60) { setStatus('❌ 题目加载超时'); return; }
            await sleep(500);
            waitAttempts++;
        }

        setStatus('📖 读取题目...');
        let question, files, language;
        try {
            question = getQuestionDescription();
            files = await loadAllFiles();
            if (files.length === 0) { setStatus('❌ 没有找到代码文件'); return; }
            language = getLanguageFromFiles(files);
        } catch (e) { setStatus('❌ 读取失败：' + e.message); return; }

        const fileDescriptions = files.map(f =>
            `### ${f.name} ${f.readOnly ? '(只读)' : '(可编辑)'}\n\`\`\`\n${f.content}\n\`\`\``
        ).join('\n\n');

        const conversationHistory = [
            { role: 'system', content: CONFIG.systemPrompt },
            { role: 'user', content: `请使用 ${language} 编写代码。\n\n题目描述：\n${question}\n\n当前文件：\n${fileDescriptions}\n\n请根据要求完成代码。` }
        ];

        for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt++) {
            if (!isRunning()) return;

            setStatus(`🤖 调用 LLM (第 ${attempt + 1} 次)...`);
            console.log(`\n========== 第 ${attempt + 1} 次调用 LLM ==========`);
            console.log('对话历史长度:', conversationHistory.length, '条消息');
            
            let llmResponse;
            try {
                llmResponse = await callLLM(conversationHistory);
            } catch (e) { setStatus('❌ LLM 调用失败：' + e.message); return; }

            conversationHistory.push({ role: 'assistant', content: llmResponse });

            const codeBlocks = parseCodeBlocks(llmResponse);
            if (codeBlocks.length === 0) {
                console.warn('[mainLoop] 未解析到代码块，将整段文本作为代码');
                codeBlocks.push({ filename: null, code: llmResponse.trim() });
            }
            console.log('解析到代码块数量:', codeBlocks.length);
            
            files = await loadAllFiles();
            const applied = await applyCodeBlocks(codeBlocks, files);
            setStatus(`✏️ 已填入文件：${applied.join(', ')}`);
            console.log('成功填入文件:', applied);
            await sleep(500);

            try { await clickSubmit(); setStatus('⏳ 已提交，等待结果...'); }
            catch (e) { setStatus('❌ 提交按钮点击失败：' + e.message); return; }

            let result;
            try { result = await waitForResult(); }
            catch (e) { setStatus('❌ 等待结果出错：' + e.message); return; }

            if (result.success) {
                setStatus('✅ 通过！得分 100，进入下一题...');
                try {
                    await sleep(1000);
                    clickNext();
                    setStatus('➡️ 已点击下一题，等待加载...');
                    let nextWait = 0;
                    while (!document.querySelector(questionSelector)) {
                        if (!isRunning()) return;
                        if (nextWait > 60) { setStatus('❌ 新题目加载超时'); return; }
                        await sleep(500); nextWait++;
                    }
                    break;
                } catch (e) { setStatus('❌ 进入下一题失败：' + e.message); return; }
            } else {
                console.log('❌ 未通过，得分:', result.score);
                console.log('错误信息:', result.error);
                
                const currentFiles = await loadAllFiles();
                const currentCodeSnapshot = currentFiles
                    .filter(f => !f.readOnly)
                    .map(f => `### ${f.name}\n\`\`\`\n${f.model.getValue()}\n\`\`\``)
                    .join('\n\n');
                
                const errorFeedback = [
                    `提交结果：得分 ${result.score}`,
                    '',
                    '错误信息：',
                    result.error,
                    '',
                    '当前编辑器中的代码（已应用你的修改）：',
                    currentCodeSnapshot,
                    '',
                    '请仔细分析错误原因，修复代码并重新输出。只输出修复后的代码，不要解释。'
                ].join('\n');
                
                conversationHistory.push({ role: 'user', content: errorFeedback });
                console.log('已追加错误反馈到对话历史，当前总消息数:', conversationHistory.length);
                
                setStatus(`❌ 未通过 (得分 ${result.score})`);
                
                if (attempt < CONFIG.maxRetries) {
                    setStatus(`🔄 准备重试 (${attempt + 1}/${CONFIG.maxRetries})...`);
                    await sleep(2000);
                } else {
                    setStatus(`⚠️ 已达最大重试次数，停止`);
                    return;
                }
            }
        }

        if (isRunning()) {
            setStatus('📖 新题目已加载，继续...');
            try { await programMainLoop(setStatus, isRunning); }
            catch (e) { setStatus('❌ ' + e.message); }
        }
    }

    // ==================== 启动 ====================
    createUI();
    console.log('[Auto-Matrix] 控制台版已启动！右上角配置面板即可使用。');
})();
