// js/api.js
// Chat-aware tasks + JSON-byproduct integration + "edit it" shorthand support
// Multi-chat + per-chat persistent tasks in localStorage

// ========== STORAGE & HELPERS ==========
// tasks variables are now per-chat but kept in globals while a chat is active
let tasksByDatetime = {}; // { "YYYY-MM-DDTHH:MM": [ { id, text } ] }
let taskIdCounter = 0;
let lastReferencedTaskId = null; // most recently created/mentioned task id (for "it" shorthand)

// Chat storage
let chats = JSON.parse(localStorage.getItem("chats")) || {};
let currentChatId = null;

function saveChats() {
  localStorage.setItem("chats", JSON.stringify(chats));
}

// Initialize a new chat with its own tasks container
function newChat() {
  const id = Date.now().toString();
  chats[id] = {
    title: "New Chat",
    messages: [],
    tasks: { tasksByDatetime: {}, taskIdCounter: 0, lastReferencedTaskId: null }
  };
  currentChatId = id;
  saveChats();
  renderTabs();
  loadTasksFromChat();
  renderChat();
  renderTasks();
}

function switchChat(id) {
  // Before switching away, persist the active chat's tasks
  saveTasksToChat();
  currentChatId = id;
  renderTabs();
  loadTasksFromChat();
  renderChat();
  renderTasks();
}

function deleteChat(id) {
  // Don't allow deleting the last remaining chat
  if (Object.keys(chats).length <= 1) {
    alert("Cannot delete the last chat. Create a new one first.");
    return;
  }
  
  // Confirm deletion
  if (!confirm("Delete this chat and all its tasks?")) {
    return;
  }
  
  // If deleting the current chat, switch to another one first
  if (id === currentChatId) {
    const remainingIds = Object.keys(chats).filter(chatId => chatId !== id);
    if (remainingIds.length > 0) {
      currentChatId = remainingIds[0];
    }
  }
  
  // Delete the chat
  delete chats[id];
  saveChats();
  
  // Re-render everything
  renderTabs();
  loadTasksFromChat();
  renderChat();
  renderTasks();
}

// renderTabs: creates compact tab buttons, adds JS-controlled spacing between title and close button
function renderTabs() {
  const container = document.getElementById("chat-tabs-container");
  if (!container) return;
  container.innerHTML = "";

  // gap in pixels between title and the close button, controlled via JS
  const tabTitleCloseGap = 12; // change this number to increase/decrease spacing

  Object.keys(chats).forEach(id => {
    const tabBtn = document.createElement("button");
    tabBtn.type = "button";
    tabBtn.className = "chat-tab" + (id === currentChatId ? " active" : "");
    tabBtn.setAttribute("role", "tab");
    tabBtn.onclick = () => switchChat(id);

    // Title (kept short)
    const titleSpan = document.createElement("span");
    titleSpan.className = "tab-title";
    titleSpan.textContent = chats[id].title || "Chat";

    // Ensure the title doesn't visually bump into the close button,
    // apply a right padding (inline style) in JS to satisfy "primarily using the js"
    titleSpan.style.paddingRight = tabTitleCloseGap + "px";
    titleSpan.style.display = "inline-block";
    titleSpan.style.maxWidth = "160px";
    titleSpan.style.overflow = "hidden";
    titleSpan.style.textOverflow = "ellipsis";
    titleSpan.style.whiteSpace = "nowrap";

    tabBtn.appendChild(titleSpan);

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "tab-close-btn";
    closeBtn.title = "Delete chat";
    closeBtn.setAttribute("aria-label", "Delete chat");
    closeBtn.innerHTML = "×";
    // Add inline margin-left too as a fallback / extra spacing
    closeBtn.style.marginLeft = tabTitleCloseGap + "px";
    closeBtn.style.background = "transparent";
    closeBtn.style.border = "none";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.fontSize = "14px";
    closeBtn.style.lineHeight = "1";
    closeBtn.style.padding = "4px";

    // prevent parent click, then delete
    closeBtn.onclick = (e) => { 
      e.stopPropagation();
      deleteChat(id);
    };

    tabBtn.appendChild(closeBtn);
    container.appendChild(tabBtn);
  });
}

function renderChat() {
  const chatOutput = document.getElementById("ai-response");
  if (!chatOutput) return;
  chatOutput.innerHTML = "";

  if (!currentChatId) return;
  const current = chats[currentChatId];
  (current.messages || []).forEach(msg => {
    const div = document.createElement("div");
    div.className = msg.role === "user" ? "user-message" : "ai-message";
    // allow line breaks
    div.innerHTML = escapeHtml(msg.content).replace(/\n/g, "<br>");
    chatOutput.appendChild(div);
  });
  chatOutput.scrollTop = chatOutput.scrollHeight;
}

// Load tasks for the currently active chat into the global variables used by the rest of the app
function loadTasksFromChat() {
  if (!currentChatId || !chats[currentChatId]) {
    tasksByDatetime = {};
    taskIdCounter = 0;
    lastReferencedTaskId = null;
    return;
  }
  const t = chats[currentChatId].tasks || { tasksByDatetime: {}, taskIdCounter: 0, lastReferencedTaskId: null };
  // deep-ish copy to avoid accidental shared references
  tasksByDatetime = JSON.parse(JSON.stringify(t.tasksByDatetime || {}));
  taskIdCounter = Number(t.taskIdCounter || 0);
  lastReferencedTaskId = t.lastReferencedTaskId || null;
}

// Save global task state into the active chat object and persist
function saveTasksToChat() {
  if (!currentChatId) return;
  chats[currentChatId].tasks = {
    tasksByDatetime: JSON.parse(JSON.stringify(tasksByDatetime || {})),
    taskIdCounter: Number(taskIdCounter || 0),
    lastReferencedTaskId: lastReferencedTaskId || null
  };
  saveChats();
}

// pad helper
function pad(n) { return n < 10 ? '0' + n : String(n); }

// local datetime key format "YYYY-MM-DDTHH:MM"
function localDatetimeKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// parse local key into Date (local)
function dateFromLocalKey(key) {
  const m = key && key.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return new Date(key || Date.now());
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), 0, 0);
}

function getCurrentLocalDatetimeKey() {
  return localDatetimeKey(new Date());
}

function formatGroupHeader(key) {
  return dateFromLocalKey(key).toLocaleString();
}

// create task object, return id
function createTaskAt(datetimeKey, text = '(unspecified)') {
  taskIdCounter += 1;
  const task = { id: 't' + taskIdCounter, text: String(text).trim() || '(untitled)' };
  if (!tasksByDatetime[datetimeKey]) tasksByDatetime[datetimeKey] = [];
  tasksByDatetime[datetimeKey].push(task);
  lastReferencedTaskId = task.id; // newest task becomes the referenced one
  saveTasksToChat();
  return task;
}

function findTaskById(id) {
  for (const k of Object.keys(tasksByDatetime)) {
    const arr = tasksByDatetime[k];
    const t = arr.find(x => x.id === id);
    if (t) return { key: k, task: t, arr };
  }
  return null;
}

// Enhanced task search - finds tasks by partial text match, exact text, or similar text
function findTasksByText(searchText, options = {}) {
  const { exactMatch = false, caseSensitive = false } = options;
  const results = [];
  
  const searchLower = caseSensitive ? searchText : searchText.toLowerCase();
  
  for (const k of Object.keys(tasksByDatetime)) {
    const arr = tasksByDatetime[k];
    arr.forEach(task => {
      const taskText = caseSensitive ? task.text : task.text.toLowerCase();
      
      let matches = false;
      if (exactMatch) {
        matches = taskText === searchLower;
      } else {
        matches = taskText.includes(searchLower) || 
                  searchLower.includes(taskText) ||
                  levenshteinDistance(taskText, searchLower) <= 2;
      }
      
      if (matches) {
        results.push({ key: k, task, arr, similarity: levenshteinDistance(taskText, searchLower) });
      }
    });
  }
  
  // Sort by similarity (lower distance = more similar)
  return results.sort((a, b) => a.similarity - b.similarity);
}

// Simple Levenshtein distance for fuzzy matching
function levenshteinDistance(str1, str2) {
  const matrix = [];
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[str2.length][str1.length];
}

function editTaskById(id, newText) {
  const found = findTaskById(id);
  if (!found) return false;
  found.task.text = String(newText).trim();
  lastReferencedTaskId = id; // Update reference when editing
  saveTasksToChat();
  return true;
}

function deleteTaskById(id) {
  const found = findTaskById(id);
  if (!found) return false;
  const idx = found.arr.indexOf(found.task);
  if (idx > -1) found.arr.splice(idx, 1);
  if (found.arr.length === 0) delete tasksByDatetime[found.key];
  if (lastReferencedTaskId === id) lastReferencedTaskId = null;
  saveTasksToChat();
  return true;
}

// Get all current tasks for context
function getCurrentTasksContext() {
  const allTasks = [];
  const sortedKeys = Object.keys(tasksByDatetime).sort();
  
  sortedKeys.forEach(key => {
    tasksByDatetime[key].forEach(task => {
      allTasks.push({
        id: task.id,
        text: task.text,
        datetime: key,
        formatted_time: formatGroupHeader(key)
      });
    });
  });
  
  return allTasks;
}

// ========== UI RENDER ==========
function renderTasks() {
  const taskList = document.getElementById('task-list');
  if (!taskList) return;
  taskList.innerHTML = '';

  const sortedKeys = Object.keys(tasksByDatetime).sort();
  if (sortedKeys.length === 0) {
    const placeholder = document.createElement('div');
    placeholder.className = 'task-placeholder';
    placeholder.textContent = 'No tasks yet for this chat.';
    taskList.appendChild(placeholder);
    return;
  }

  sortedKeys.forEach(key => {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'task-group';

    const header = document.createElement('div');
    header.className = 'task-group-header';
    header.textContent = formatGroupHeader(key);
    groupDiv.appendChild(header);

    const ul = document.createElement('ul');
    tasksByDatetime[key].forEach(task => {
      const li = document.createElement('li');
      li.setAttribute('data-task-id', task.id); // Add task ID for easier reference
      
      const span = document.createElement('span');
      span.className = 'task-text';
      span.textContent = task.text;

      const btnContainer = document.createElement('div');
      btnContainer.className = 'task-buttons';

      const editBtn = document.createElement('button');
      editBtn.innerHTML = '✏️';
      editBtn.title = 'Edit';
      editBtn.onclick = () => {
        const newText = prompt('Edit task:', task.text);
        if (newText !== null && newText.trim() !== '') {
          editTaskById(task.id, newText.trim());
          renderTasks();
        }
      };

      const deleteBtn = document.createElement('button');
      deleteBtn.innerHTML = '🗑️';
      deleteBtn.title = 'Delete';
      deleteBtn.onclick = () => {
        if (confirm('Delete this task?')) {
          deleteTaskById(task.id);
          renderTasks();
        }
      };

      btnContainer.appendChild(editBtn);
      btnContainer.appendChild(deleteBtn);

      li.appendChild(span);
      li.appendChild(btnContainer);
      ul.appendChild(li);
    });

    groupDiv.appendChild(ul);
    taskList.appendChild(groupDiv);
  });
}

// ========== JSON EXTRACTION (byproduct) ==========
function extractFirstJson(text) {
  if (!text || typeof text !== 'string') return { jsonText: null, restText: '' };

  const fencedJson = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedJson) {
    const jsonText = fencedJson[1].trim();
    const rest = (text.slice(0, fencedJson.index) + text.slice(fencedJson.index + fencedJson[0].length)).trim();
    return { jsonText, restText: rest };
  }
  const fencedAny = text.match(/```(?:[\s\S]*?)```/);
  if (fencedAny) {
    const inner = fencedAny[0].replace(/(^```[\s\S]*?\n)|(```$)/g, '').trim();
    if ((inner.startsWith('{') && inner.endsWith('}')) || (inner.startsWith('[') && inner.endsWith(']'))) {
      const rest = (text.slice(0, fencedAny.index) + text.slice(fencedAny.index + fencedAny[0].length)).trim();
      return { jsonText: inner, restText: rest };
    }
  }

  const startIndex = Math.min(...['{','['].map(ch => { const idx = text.indexOf(ch); return idx === -1?Number.POSITIVE_INFINITY:idx; }));
  if (!isFinite(startIndex)) return { jsonText: null, restText: text.trim() };

  let i = startIndex;
  const len = text.length;
  const stack = [];
  let inString = false, escape = false;
  for (; i < len; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    } else {
      if (ch === '"') { inString = true; continue; }
      if (ch === '{' || ch === '[') { stack.push(ch); continue; }
      if (ch === '}' || ch === ']') {
        if (stack.length === 0) break;
        const top = stack[stack.length - 1];
        if ((top === '{' && ch === '}') || (top === '[' && ch === ']')) {
          stack.pop();
          if (stack.length === 0) {
            const jsonText = text.slice(startIndex, i + 1).trim();
            const rest = (text.slice(0, startIndex) + text.slice(i + 1)).trim();
            return { jsonText, restText: rest };
          }
        } else break;
      }
    }
  }
  return { jsonText: null, restText: text.trim() };
}

// Enhanced datetime parsing that handles natural language
function parseDatetimeCandidate(raw) {
  if (!raw) return getCurrentLocalDatetimeKey();
  raw = String(raw).trim();

  // If already in correct format, return as-is
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return raw;

  // Handle natural language datetime expressions
  const now = new Date();
  let targetDate = new Date(now);

  // Handle "tomorrow" cases
  if (/tomorrow/i.test(raw)) {
    targetDate.setDate(now.getDate() + 1);

    // Extract time if specified (e.g., "5pm tomorrow", "tomorrow at 3:30pm")
    const timeMatch = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2] || '0');
      const ampm = timeMatch[3].toLowerCase();

      if (ampm === 'pm' && hours !== 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;

      targetDate.setHours(hours, minutes, 0, 0);
    } else {
      // Check for 24-hour format (e.g., "tomorrow 17:00")
      const time24Match = raw.match(/(\d{1,2}):(\d{2})/);
      if (time24Match) {
        targetDate.setHours(parseInt(time24Match[1]), parseInt(time24Match[2]), 0, 0);
      }
    }

    return localDatetimeKey(targetDate);
  }

  // Handle "today" cases with time
  if (/today/i.test(raw)) {
    const timeMatch = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2] || '0');
      const ampm = timeMatch[3].toLowerCase();

      if (ampm === 'pm' && hours !== 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;

      targetDate.setHours(hours, minutes, 0, 0);
    } else {
      const time24Match = raw.match(/(\d{1,2}):(\d{2})/);
      if (time24Match) {
        targetDate.setHours(parseInt(time24Match[1]), parseInt(time24Match[2]), 0, 0);
      }
    }

    return localDatetimeKey(targetDate);
  }

  // Handle other day names (Monday, Tuesday, etc.)
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < dayNames.length; i++) {
    if (new RegExp(dayNames[i], 'i').test(raw)) {
      const currentDay = now.getDay();
      let daysUntil = i - currentDay;
      if (daysUntil <= 0) daysUntil += 7; // Next occurrence of this day

      targetDate.setDate(now.getDate() + daysUntil);

      // Extract time if specified
      const timeMatch = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2] || '0');
        const ampm = timeMatch[3].toLowerCase();

        if (ampm === 'pm' && hours !== 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;

        targetDate.setHours(hours, minutes, 0, 0);
      }

      return localDatetimeKey(targetDate);
    }
  }

  // Try standard Date parsing
  const d = new Date(raw);
  if (!isNaN(d)) return localDatetimeKey(d);

  // Extract ISO-like datetime prefix
  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  if (isoMatch) return isoMatch[1];

  // Fallback to current time
  return getCurrentLocalDatetimeKey();
}

// ========== SHORTHAND DETECTION ==========
// Detect "edit it to watering garden" and similar. Returns the new text or null.
function detectEditShorthand(message) {
  // covers: edit it to X, change it to X, rename it to X, edit that to X
  const m = message.match(/^\s*(?:edit|change|rename)\s+(?:it|that|this|the task|the)\s+(?:to|into)?\s+(.+)$/i);
  if (m) return m[1].trim();
  // also allow: "Edit previous to X" or "edit last to X"
  const m2 = message.match(/^\s*(?:edit)\s+(?:previous|last)\s+(?:to|into)?\s+(.+)$/i);
  if (m2) return m2[1].trim();
  return null;
}

// ========== ENHANCED TASK ACTION PROCESSOR ==========
function processTaskActions(taskActions) {
  const results = [];
  
  taskActions.forEach(action => {
    const actionType = String(action.action || '').toLowerCase();
    
    try {
      switch (actionType) {
        case 'add':
        case 'create':
          const key = parseDatetimeCandidate(action.datetime || action.when || action.time);
          const text = String(action.task || action.text || action.description || '').trim();
          
          if (!text || text === '') {
            results.push({ success: false, action, error: 'No task text provided' });
            break;
          }
          
          const created = createTaskAt(key, text);
          results.push({ success: true, action, task: created, operation: 'created' });
          break;
          
        case 'edit':
        case 'update':
        case 'modify':
        case 'change':
          let target = null;
          
          // Try to find by ID first
          if (action.id || action.taskId) {
            target = findTaskById(action.id || action.taskId);
          }
          // Try to find by text search
          else if (action.find || action.search || action.old || action.original) {
            const searchText = action.find || action.search || action.old || action.original;
            const matches = findTasksByText(searchText);
            if (matches.length > 0) {
              target = matches[0]; // Use best match
            }
          }
          // Use last referenced task if available
          else if (lastReferencedTaskId) {
            target = findTaskById(lastReferencedTaskId);
          }
          
          if (target) {
            const newText = String(action.task || action.text || action.new || action.to || '').trim();
            if (newText) {
              const oldText = target.task.text;
              target.task.text = newText;
              lastReferencedTaskId = target.task.id;
              saveTasksToChat();
              results.push({ success: true, action, task: target.task, operation: 'edited', oldText, newText });
            } else {
              results.push({ success: false, action, error: 'No new text provided for edit' });
            }
          } else {
            results.push({ success: false, action, error: 'Could not find task to edit' });
          }
          break;
          
        case 'delete':
        case 'remove':
        case 'cancel':
          let deleteTarget = null;
          
          // Try to find by ID first
          if (action.id || action.taskId) {
            deleteTarget = findTaskById(action.id || action.taskId);
          }
          // Try to find by text search
          else if (action.find || action.search || action.task || action.text) {
            const searchText = action.find || action.search || action.task || action.text;
            const matches = findTasksByText(searchText);
            if (matches.length > 0) {
              deleteTarget = matches[0]; // Use best match
            }
          }
          // Use last referenced task if available
          else if (lastReferencedTaskId) {
            deleteTarget = findTaskById(lastReferencedTaskId);
          }
          
          if (deleteTarget) {
            const deletedText = deleteTarget.task.text;
            const success = deleteTaskById(deleteTarget.task.id);
            if (success) {
              results.push({ success: true, action, operation: 'deleted', deletedText });
            } else {
              results.push({ success: false, action, error: 'Failed to delete task' });
            }
          } else {
            results.push({ success: false, action, error: 'Could not find task to delete' });
          }
          break;
          
        case 'move':
        case 'reschedule':
          let moveTarget = null;
          
          // Find target task similar to edit
          if (action.id || action.taskId) {
            moveTarget = findTaskById(action.id || action.taskId);
          } else if (action.find || action.search || action.task) {
            const searchText = action.find || action.search || action.task;
            const matches = findTasksByText(searchText);
            if (matches.length > 0) {
              moveTarget = matches[0];
            }
          } else if (lastReferencedTaskId) {
            moveTarget = findTaskById(lastReferencedTaskId);
          }
          
          if (moveTarget) {
            const newKey = parseDatetimeCandidate(action.to || action.datetime || action.when);
            
            // Remove from old location
            const oldArr = moveTarget.arr;
            const idx = oldArr.indexOf(moveTarget.task);
            if (idx > -1) oldArr.splice(idx, 1);
            if (oldArr.length === 0) delete tasksByDatetime[moveTarget.key];
            
            // Add to new location
            if (!tasksByDatetime[newKey]) tasksByDatetime[newKey] = [];
            tasksByDatetime[newKey].push(moveTarget.task);
            
            lastReferencedTaskId = moveTarget.task.id;
            saveTasksToChat();
            results.push({ success: true, action, task: moveTarget.task, operation: 'moved', from: moveTarget.key, to: newKey });
          } else {
            results.push({ success: false, action, error: 'Could not find task to move' });
          }
          break;
          
        default:
          results.push({ success: false, action, error: `Unknown action type: ${actionType}` });
      }
    } catch (error) {
      results.push({ success: false, action, error: error.message });
    }
  });
  
  return results;
}

// ========== CHAT + NLP + JSON-BYPRODUCT ==========
async function sendToChatGPT() {
  const userInputEl = document.getElementById('user-input');
  const userInput = (userInputEl && userInputEl.value || '').trim();
  const sendBtn = document.getElementById('send-btn');
  const chatOutput = document.getElementById('ai-response');

  if (!userInput) return alert('Please enter a message first!');

  // Append user bubble to UI
  const userMsgDiv = document.createElement('div');
  userMsgDiv.className = 'user-message';
  userMsgDiv.innerHTML = escapeHtml(userInput).replace(/\n/g, '<br>');
  chatOutput.appendChild(userMsgDiv);
  chatOutput.scrollTop = chatOutput.scrollHeight;
  if (userInputEl) userInputEl.value = '';

  // Save user message into current chat
  if (currentChatId) {
    chats[currentChatId].messages.push({ role: "user", content: userInput });
    // Optionally rename chat to start of message if default title
    if (chats[currentChatId].title === 'New Chat') {
      chats[currentChatId].title = userInput.slice(0, 30) || 'Chat';
    }
    saveChats();
  }

  // --- 1) Shortcut: check edit-shorthand and apply locally ---
  const shorthandNewText = detectEditShorthand(userInput);
  if (shorthandNewText && lastReferencedTaskId) {
    const success = editTaskById(lastReferencedTaskId, shorthandNewText);
    if (success) {
      // show assistant confirmation message
      const sysDiv = document.createElement('div');
      sysDiv.className = 'ai-message';
      sysDiv.innerHTML = `Updated the previous task to: <strong>${escapeHtml(shorthandNewText)}</strong>`;
      chatOutput.appendChild(sysDiv);
      renderTasks();
      chatOutput.scrollTop = chatOutput.scrollHeight;

      // Save assistant confirmation into chat
      if (currentChatId) {
        chats[currentChatId].messages.push({ role: "assistant", content: `Updated the previous task to: ${shorthandNewText}` });
        saveChats();
      }
      return; // handled locally — don't call backend
    } else {
      // couldn't find referenced task; fall through to normal flow (call backend)
    }
  }

  // --- 2) prepare comprehensive system prompt with task context ---
  const currentTime = new Date().toLocaleString();
  const currentTasks = getCurrentTasksContext();
  
  // Build conversation history
  let conversationHistory = "";
  if (currentChatId && chats[currentChatId].messages.length > 1) {
    // Get previous messages (excluding the current one we just added)
    const previousMessages = chats[currentChatId].messages.slice(0, -1);
    conversationHistory = "\n\nPrevious conversation:\n";
    previousMessages.forEach(msg => {
      conversationHistory += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
    });
  }

  // Build current tasks context
  let tasksContext = "";
  if (currentTasks.length > 0) {
    tasksContext = "\n\nCurrent tasks:\n";
    currentTasks.forEach(task => {
      tasksContext += `ID: ${task.id} | "${task.text}" | ${task.formatted_time}\n`;
    });
  } else {
    tasksContext = "\n\nNo current tasks.";
  }

  const systemPrompt = `You are an advanced task management assistant. Current time is: ${currentTime}

CRITICAL INSTRUCTIONS FOR TASK OPERATIONS:
You must respond with JSON FIRST when handling task requests, then provide a friendly explanation.

JSON FORMAT - Use this exact structure for all task operations:
[
  {
    "action": "add|edit|delete|move",
    "task": "task description",
    "datetime": "YYYY-MM-DDTHH:MM",
    "id": "task_id_if_editing_or_deleting",
    "find": "text_to_search_for_if_no_id",
    "to": "new_datetime_if_moving"
  }
]

SUPPORTED ACTIONS:
1. ADD/CREATE: {"action": "add", "task": "Buy groceries", "datetime": "2025-08-16T17:00"}
2. EDIT/UPDATE: {"action": "edit", "id": "t123", "task": "Buy organic groceries"} OR {"action": "edit", "find": "Buy groceries", "task": "Buy organic groceries"}
3. DELETE/REMOVE: {"action": "delete", "id": "t123"} OR {"action": "delete", "find": "Buy groceries"}
4. MOVE/RESCHEDULE: {"action": "move", "id": "t123", "to": "2025-08-17T10:00"} OR {"action": "move", "find": "groceries", "to": "tomorrow 10am"}

DATETIME HANDLING:
- Always convert natural language to exact format: YYYY-MM-DDTHH:MM
- "tomorrow 5pm" = "2025-08-16T17:00"
- "Monday 2pm" = "2025-08-19T14:00" 
- "in 2 hours" = calculate exact time
- If no time specified, use appropriate default (9am for morning tasks, 6pm for evening)

TASK IDENTIFICATION FOR EDIT/DELETE:
- Use "id" field when you know the exact task ID
- Use "find" field to search by text content (supports fuzzy matching)
- System will find the best match automatically

EXAMPLES OF COMPLEX REQUESTS:
User: "Change my grocery task to include organic vegetables"
Response: [{"action": "edit", "find": "grocery", "task": "Buy organic vegetables and groceries"}]

User: "Move my dentist appointment to Friday at 2pm"  
Response: [{"action": "move", "find": "dentist", "to": "2025-08-22T14:00"}]

User: "Delete all tasks about cleaning"
Response: [{"action": "delete", "find": "cleaning"}]

User: "Add 5 random tasks for this weekend"
Response: [
  {"action": "add", "task": "Morning jog in the park", "datetime": "2025-08-16T08:00"},
  {"action": "add", "task": "Read a book", "datetime": "2025-08-16T14:00"},
  {"action": "add", "task": "Meal prep for next week", "datetime": "2025-08-17T10:00"},
  {"action": "add", "task": "Video call with family", "datetime": "2025-08-17T15:00"},
  {"action": "add", "task": "Plan next week's schedule", "datetime": "2025-08-17T19:00"}
]
${conversationHistory}${tasksContext}

User said: ${userInput}`;

  try {
    // show loading bubble
    const loadingMessage = document.createElement('div');
    loadingMessage.className = 'ai-message loading';
    loadingMessage.innerHTML = 'ChatGPT is thinking...';
    chatOutput.appendChild(loadingMessage);
    chatOutput.scrollTop = chatOutput.scrollHeight;

    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';

    // call backend
    const response = await fetch('http://localhost:8000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: systemPrompt })
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    const fullReply = String(data.response || '');

    // extract JSON byproduct
    const { jsonText, restText } = extractFirstJson(fullReply);
    let taskActions = [];
    if (jsonText) {
      try {
        taskActions = JSON.parse(jsonText);
        if (!Array.isArray(taskActions)) taskActions = [taskActions];
      } catch (e) {
        console.warn('Failed to parse JSON from AI:', e, jsonText);
        taskActions = [];
      }
    }

    // Process actions with enhanced processor
    let operationSummary = "";
    if (Array.isArray(taskActions) && taskActions.length > 0) {
      const results = processTaskActions(taskActions);
      
      // Create summary of operations
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      
      if (successful.length > 0) {
        operationSummary += `✅ Completed ${successful.length} task operation(s):\n`;
        successful.forEach(r => {
          switch(r.operation) {
            case 'created':
              operationSummary += `• Created: "${r.task.text}"\n`;
              break;
            case 'edited':
              operationSummary += `• Edited: "${r.oldText}" → "${r.newText}"\n`;
              break;
            case 'deleted':
              operationSummary += `• Deleted: "${r.deletedText}"\n`;
              break;
            case 'moved':
              operationSummary += `• Moved: "${r.task.text}" to ${formatGroupHeader(r.to)}\n`;
              break;
          }
        });
      }
      
      if (failed.length > 0) {
        operationSummary += `❌ Failed ${failed.length} operation(s):\n`;
        failed.forEach(r => {
          operationSummary += `• ${r.error}\n`;
        });
      }

      renderTasks();
    }

    // Show AI response: prefer restText, fallback to full reply, include operation summary
    let displayText = "";
    if (operationSummary) {
      displayText = operationSummary + "\n\n";
    }
    displayText += (restText && restText.trim().length > 0) ? restText.trim() : fullReply.trim();
    
    loadingMessage.innerHTML = escapeHtml(displayText).replace(/\n/g, '<br>');

    // Save assistant reply into current chat
    if (currentChatId) {
      chats[currentChatId].messages.push({ role: "assistant", content: displayText });
      saveChats();
    }

    chatOutput.scrollTop = chatOutput.scrollHeight;

  } catch (error) {
    console.error('Error:', error);
    const errorBubble = document.createElement('div');
    errorBubble.className = 'ai-message error';
    errorBubble.innerHTML = `<strong>Error:</strong> ${escapeHtml(error.message)}`;
    const chatOutput = document.getElementById('ai-response');
    if (chatOutput) chatOutput.appendChild(errorBubble);

    // Save error into chat history too
    if (currentChatId) {
      chats[currentChatId].messages.push({ role: "assistant", content: `Error: ${error.message}` });
      saveChats();
    }
  } finally {
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send'; }
    const chatOutputFinal = document.getElementById('ai-response');
    if (chatOutputFinal) chatOutputFinal.scrollTop = chatOutputFinal.scrollHeight;
  }
}

// basic HTML escape for safety when inserting AI text into innerHTML
function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

// Enter key send (Shift+Enter for newline)
const userInputElem = document.getElementById('user-input');
if (userInputElem) {
  userInputElem.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendToChatGPT();
    }
  });
}

// Add task button handler
function addTask() {
  const datetimeEl = document.getElementById('new-task-datetime');
  const textEl = document.getElementById('new-task');
  const datetime = datetimeEl.value ? datetimeEl.value : getCurrentLocalDatetimeKey();
  const key = parseDatetimeCandidate(datetime);
  const text = textEl.value.trim();

  if (!text) {
    alert('Please enter a task description.');
    return;
  }

  createTaskAt(key, text);
  renderTasks();
  textEl.value = '';
  datetimeEl.value = '';
}

// Initialize on load: create a chat if none exist, otherwise load the first
window.onload = () => {
  if (Object.keys(chats).length === 0) {
    newChat();
  } else {
    currentChatId = Object.keys(chats)[0];
    renderTabs();
    loadTasksFromChat();
    renderChat();
    renderTasks();
  }
};