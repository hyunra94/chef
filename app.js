const STORAGE_KEY = "fridge-chef-v7";
const LEGACY_KEYS = ["fridge-chef-v6", "fridge-chef-v5", "fridge-chef-v4", "fridge-chef-v3", "fridge-chef-v2", "fridge-chef-v1"];
const SETTINGS_KEY = "fridge-chef-settings-v1";

const categoryLabels = {
  main: "메인재료",
  sub: "서브재료",
  sauce: "소스류"
};

const categoryOrder = ["main", "sub", "sauce"];

const defaultState = {
  ingredients: [
    {
      id: makeId(),
      name: "두부",
      category: "main",
      quantity: 1,
      unit: "모",
      createdAt: todayISO(),
      expiresAt: addDaysISO(2),
      memo: "먼저 먹기"
    },
    {
      id: makeId(),
      name: "양파",
      category: "sub",
      quantity: 2,
      unit: "개",
      createdAt: todayISO(),
      expiresAt: addDaysISO(5),
      memo: ""
    },
    {
      id: makeId(),
      name: "간장",
      category: "sauce",
      quantity: 1,
      unit: "병",
      createdAt: todayISO(),
      expiresAt: "",
      memo: ""
    }
  ],
  recipeMustUseIds: [],
  latestRecipes: [],
  recipeHistory: []
};

defaultState.recipeMustUseIds = [defaultState.ingredients[0].id];

let state = loadState();
let settings = loadSettings();
let currentFilter = "all";
let currentSearch = "";
let viewMode = "simple";
let ratingFilter = "all";
let showingTrash = false;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const elements = {};

document.addEventListener("DOMContentLoaded", init);
window.addEventListener("error", (event) => {
  console.error("Fridge Chef error:", event.error || event.message);
});

function init() {
  collectElements();
  registerServiceWorker();
  bindEvents();
  if (elements.workerUrlInput) elements.workerUrlInput.value = settings.workerUrl || "";
  renderAll();
}

function collectElements() {
  Object.assign(elements, {
    tabs: $$(".nav-btn"),
    panels: $$(".tab-panel"),
    headerAddBtn: $("#headerAddBtn"),
    ingredientModal: $("#ingredientModal"),
    closeIngredientModal: $("#closeIngredientModal"),
    ingredientForm: $("#ingredientForm"),
    ingredientModalEyebrow: $("#ingredientModalEyebrow"),
    ingredientModalTitle: $("#ingredientModalTitle"),
    ingredientSubmitBtn: $("#ingredientSubmitBtn"),
    editingIngredientId: $("#editingIngredientId"),
    toggleExpireBtn: $("#toggleExpireBtn"),
    expireField: $("#expireField"),
    expiresInput: $("#expiresInput"),
    ingredientGroups: $("#ingredientGroups"),
    recommendIngredientGroups: $("#recommendIngredientGroups"),
    ingredientSearch: $("#ingredientSearch"),
    recipeResults: $("#recipeResults"),
    recipeHistory: $("#recipeHistory"),
    recipeStatus: $("#recipeStatus"),
    recipeRecommendBtn: $("#recipeRecommendBtn"),
    clearSelectedBtn: $("#clearSelectedBtn"),
    ratingFilter: $("#ratingFilter"),
    toggleTrashBtn: $("#toggleTrashBtn"),
    workerUrlInput: $("#workerUrlInput"),
    saveSettingsBtn: $("#saveSettingsBtn"),
    exportBtn: $("#exportBtn"),
    importInput: $("#importInput"),
    resetBtn: $("#resetBtn")
  });
}

function bindEvents() {
  elements.tabs.forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  on(elements.headerAddBtn, "click", () => openIngredientModal());
  on(elements.closeIngredientModal, "click", closeIngredientModal);
  on(elements.toggleExpireBtn, "click", toggleExpireField);
  on(elements.ingredientForm, "submit", handleIngredientSubmit);

  $$("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      currentFilter = button.dataset.filter;
      $$("[data-filter]").forEach((item) => item.classList.toggle("active", item === button));
      renderIngredients();
    });
  });

  $$("[data-view-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      viewMode = button.dataset.viewMode;
      $$("[data-view-mode]").forEach((item) => item.classList.toggle("active", item === button));
      renderIngredients();
    });
  });

  on(elements.ingredientSearch, "input", (event) => {
    currentSearch = event.target.value.trim().toLowerCase();
    renderIngredients();
  });

  on(elements.recipeRecommendBtn, "click", generateRecipes);
  on(elements.clearSelectedBtn, "click", () => {
    state.recipeMustUseIds = [];
    saveState();
    renderRecommendPicker();
    toast("선택을 해제했어요.");
  });

  on(elements.ratingFilter, "change", (event) => {
    ratingFilter = event.target.value;
    renderRecipeHistory();
  });

  on(elements.toggleTrashBtn, "click", () => {
    showingTrash = !showingTrash;
    elements.toggleTrashBtn.textContent = showingTrash ? "히스토리 보기" : "휴지통 보기";
    renderRecipeHistory();
  });

  on(elements.saveSettingsBtn, "click", () => {
    settings.workerUrl = elements.workerUrlInput.value.trim();
    saveSettings();
    toast("설정을 저장했어요.");
  });

  on(elements.exportBtn, "click", exportData);
  on(elements.importInput, "change", importData);
  on(elements.resetBtn, "click", () => {
    const ok = confirm("로컬에 저장된 재료와 레시피를 모두 초기화할까요?");
    if (!ok) return;
    localStorage.removeItem(STORAGE_KEY);
    LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
    state = { ingredients: [], recipeMustUseIds: [], latestRecipes: [], recipeHistory: [] };
    saveState();
    renderAll();
    toast("초기화했어요.");
  });

  document.addEventListener("click", handleDynamicClick);
  document.addEventListener("input", handleDynamicInput);
}

function on(element, eventName, handler) {
  if (!element) {
    console.warn(`Missing element for ${eventName} handler`);
    return;
  }
  element.addEventListener(eventName, handler);
}

function switchTab(tabName) {
  document.body.dataset.currentTab = tabName;
  elements.tabs.forEach((button) => button.classList.toggle("active", button.dataset.tab === tabName));
  elements.panels.forEach((panel) => panel.classList.toggle("active", panel.id === `tab-${tabName}`));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openIngredientModal(id = "") {
  resetIngredientForm();
  if (id) {
    const item = state.ingredients.find((ingredient) => ingredient.id === id);
    if (!item) return;
    elements.editingIngredientId.value = item.id;
    elements.ingredientModalEyebrow.textContent = "Edit";
    elements.ingredientModalTitle.textContent = "재료 수정";
    elements.ingredientSubmitBtn.textContent = "수정 저장";
    $("#nameInput").value = item.name;
    $("#categoryInput").value = item.category;
    $("#quantityInput").value = item.quantity;
    $("#unitInput").value = item.unit;
    $("#memoInput").value = item.memo || "";
    if (item.expiresAt) {
      elements.expireField.classList.remove("hidden");
      elements.expiresInput.value = item.expiresAt;
      elements.toggleExpireBtn.textContent = "유통기한 숨기기";
    }
  }

  if (elements.ingredientModal && typeof elements.ingredientModal.showModal === "function") {
    elements.ingredientModal.showModal();
  } else if (elements.ingredientModal) {
    elements.ingredientModal.setAttribute("open", "");
  }
}

function closeIngredientModal() {
  if (elements.ingredientModal && typeof elements.ingredientModal.close === "function") {
    elements.ingredientModal.close();
  } else if (elements.ingredientModal) {
    elements.ingredientModal.removeAttribute("open");
  }
}

function resetIngredientForm() {
  elements.ingredientForm.reset();
  elements.editingIngredientId.value = "";
  elements.ingredientModalEyebrow.textContent = "Add";
  elements.ingredientModalTitle.textContent = "재료 추가";
  elements.ingredientSubmitBtn.textContent = "저장";
  $("#quantityInput").value = 1;
  $("#unitInput").value = "개";
  $("#categoryInput").value = "sub";
  elements.expiresInput.value = "";
  elements.expireField.classList.add("hidden");
  elements.toggleExpireBtn.textContent = "유통기한 입력하기";
}

function toggleExpireField() {
  const isHidden = elements.expireField.classList.toggle("hidden");
  elements.toggleExpireBtn.textContent = isHidden ? "유통기한 입력하기" : "유통기한 숨기기";
  if (!isHidden && !elements.expiresInput.value) {
    elements.expiresInput.value = addDaysISO(7);
  }
}

function handleIngredientSubmit(event) {
  event.preventDefault();
  const name = $("#nameInput").value.trim();
  if (!name) return;

  const editingId = elements.editingIngredientId.value;
  const data = {
    name,
    category: $("#categoryInput").value,
    quantity: Number($("#quantityInput").value || 0),
    unit: $("#unitInput").value.trim() || "개",
    expiresAt: elements.expireField.classList.contains("hidden") ? "" : elements.expiresInput.value,
    memo: $("#memoInput").value.trim()
  };

  if (editingId) {
    const item = state.ingredients.find((ingredient) => ingredient.id === editingId);
    if (item) Object.assign(item, data);
  } else {
    const duplicate = state.ingredients.find((item) => item.name === data.name && item.category === data.category && item.unit === data.unit);
    if (duplicate) {
      duplicate.quantity = Number(duplicate.quantity) + Number(data.quantity);
      duplicate.expiresAt = data.expiresAt || duplicate.expiresAt;
      duplicate.memo = data.memo || duplicate.memo;
    } else {
      state.ingredients.push({
        id: makeId(),
        ...data,
        createdAt: todayISO()
      });
    }
  }

  cleanMustUseIds();
  saveState();
  renderAll();
  closeIngredientModal();
  switchTab("fridge");
}

function handleDynamicClick(event) {
  const button = event.target.closest("button");
  if (!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;
  if (!action || !id) return;

  if (action === "increase") adjustQuantity(id, 1);
  if (action === "decrease") adjustQuantity(id, -1);
  if (action === "edit-ingredient") openIngredientModal(id);
  if (action === "delete-ingredient") deleteIngredient(id);
  if (action === "rate-recipe") rateRecipe(id, Number(button.dataset.value));
  if (action === "trash-recipe") moveRecipeToTrash(id);
  if (action === "restore-recipe") restoreRecipe(id);
  if (action === "delete-recipe-forever") deleteRecipeForever(id);
}

function handleDynamicInput(event) {
  if (event.target.matches("[data-action='toggle-recipe-ingredient']")) {
    toggleRecipeMustUse(event.target.dataset.id, event.target.checked);
  }

  if (event.target.matches(".review-input")) {
    updateRecipeMemo(event.target.dataset.id, event.target.value);
  }
}

function adjustQuantity(id, delta) {
  const item = state.ingredients.find((ingredient) => ingredient.id === id);
  if (!item) return;

  const nextQuantity = Number((Number(item.quantity) + delta).toFixed(2));
  if (nextQuantity <= 0) {
    const ok = confirm(`${item.name} 수량이 0이 됩니다. 재료를 삭제할까요?`);
    if (ok) {
      state.ingredients = state.ingredients.filter((ingredient) => ingredient.id !== id);
      state.recipeMustUseIds = state.recipeMustUseIds.filter((itemId) => itemId !== id);
    }
  } else {
    item.quantity = nextQuantity;
  }
  saveState();
  renderAll();
}

function toggleRecipeMustUse(id, explicitValue) {
  const exists = state.ingredients.some((ingredient) => ingredient.id === id);
  if (!exists) return;

  const selected = new Set(state.recipeMustUseIds || []);
  const shouldSelect = typeof explicitValue === "boolean" ? explicitValue : !selected.has(id);

  if (shouldSelect) selected.add(id);
  else selected.delete(id);

  state.recipeMustUseIds = Array.from(selected);
  saveState();
  renderRecommendPicker();
}

function deleteIngredient(id) {
  const item = state.ingredients.find((ingredient) => ingredient.id === id);
  if (!item) return;
  const ok = confirm(`${item.name} 재료를 삭제할까요?`);
  if (!ok) return;
  state.ingredients = state.ingredients.filter((ingredient) => ingredient.id !== id);
  state.recipeMustUseIds = (state.recipeMustUseIds || []).filter((itemId) => itemId !== id);
  saveState();
  renderAll();
}

function renderAll() {
  cleanMustUseIds();
  renderIngredients();
  renderRecommendPicker();
  renderLatestRecipes();
  renderRecipeHistory();
}

function renderIngredients() {
  const filtered = getFilteredIngredients();
  if (!filtered.length) {
    renderEmpty(elements.ingredientGroups, "등록된 재료가 없어요.", "재료를 추가하면 분류별로 정리됩니다.");
    return;
  }

  elements.ingredientGroups.classList.toggle("detail-mode", viewMode === "detail");
  elements.ingredientGroups.innerHTML = categoryOrder
    .map((category) => {
      const items = filtered.filter((item) => item.category === category);
      if (!items.length) return "";
      return renderIngredientGroup(category, items);
    })
    .join("");
}

function getFilteredIngredients() {
  return [...state.ingredients]
    .filter((item) => currentFilter === "all" || item.category === currentFilter)
    .filter((item) => {
      if (!currentSearch) return true;
      return [item.name, item.memo, categoryLabels[item.category]].some((value) => String(value || "").toLowerCase().includes(currentSearch));
    })
    .sort(sortIngredients);
}

function renderIngredientGroup(category, items) {
  return `
    <section class="ingredient-group surface-inset">
      <div class="group-title-row">
        <h3>${escapeHTML(categoryLabels[category])}</h3>
        <span class="group-count">${items.length}개</span>
      </div>
      <div class="ingredient-list">
        ${items.map(renderIngredientRow).join("")}
      </div>
    </section>
  `;
}

function renderIngredientRow(item) {
  const dday = formatDday(item.expiresAt);
  const days = getDaysUntil(item.expiresAt);
  const ddayClass = days !== null && days <= 3 ? "danger" : days !== null ? "safe" : "";
  const detailParts = [
    `입력일 ${formatDate(item.createdAt)}`,
    item.expiresAt ? `유통기한 ${formatDate(item.expiresAt)}` : "유통기한 없음",
    item.memo ? `메모 ${item.memo}` : ""
  ].filter(Boolean);

  return `
    <article class="ingredient-row surface-raised-small">
      <div class="ingredient-main">
        <div class="ingredient-name-row">
          <strong class="ingredient-name">${escapeHTML(item.name)}</strong>
          <span class="qty-text">${escapeHTML(item.quantity)}${escapeHTML(item.unit)}</span>
          ${item.expiresAt ? `<span class="d-day-badge ${ddayClass}">${escapeHTML(dday)}</span>` : ""}
        </div>
        <div class="row-detail">${escapeHTML(detailParts.join(" · "))}</div>
      </div>
      <div class="row-actions">
        <div class="qty-mini surface-inset-small" aria-label="수량 조절">
          <button class="qty-btn" type="button" data-action="decrease" data-id="${item.id}">−</button>
          <button class="qty-btn" type="button" data-action="increase" data-id="${item.id}">+</button>
        </div>
        <button class="tiny-btn" type="button" data-action="edit-ingredient" data-id="${item.id}">수정</button>
        <button class="tiny-btn danger" type="button" data-action="delete-ingredient" data-id="${item.id}">삭제</button>
      </div>
    </article>
  `;
}

function renderRecommendPicker() {
  if (!state.ingredients.length) {
    renderEmpty(elements.recommendIngredientGroups, "선택할 재료가 없어요.", "냉장고 탭에서 재료를 먼저 추가해주세요.");
    return;
  }

  const selected = new Set(state.recipeMustUseIds || []);
  elements.recommendIngredientGroups.innerHTML = categoryOrder
    .map((category) => {
      const items = state.ingredients.filter((item) => item.category === category).sort(sortIngredients);
      if (!items.length) return "";
      return `
        <div class="recommend-group">
          <h4>${escapeHTML(categoryLabels[category])}</h4>
          ${items.map((item) => renderRecommendChip(item, selected)).join("")}
        </div>
      `;
    })
    .join("");
}

function renderRecommendChip(item, selected) {
  const checked = selected.has(item.id);
  const dday = item.expiresAt ? formatDday(item.expiresAt) : "";
  return `
    <label class="check-chip ${checked ? "active" : ""}">
      <span>${escapeHTML(item.name)} <small>${escapeHTML(item.quantity)}${escapeHTML(item.unit)} ${escapeHTML(dday)}</small></span>
      <input type="checkbox" data-action="toggle-recipe-ingredient" data-id="${item.id}" ${checked ? "checked" : ""} />
    </label>
  `;
}

async function generateRecipes() {
  if (!state.ingredients.length) {
    elements.recipeStatus.textContent = "재료를 먼저 추가해주세요.";
    switchTab("fridge");
    return;
  }

  elements.recipeStatus.textContent = "레시피를 구성하는 중입니다...";
  elements.recipeResults.innerHTML = "";

  const payload = buildRecipePayload();

  try {
    const recipes = settings.workerUrl ? await requestRecipesFromWorker(payload) : makeLocalRecipes(payload);
    const stamped = recipes.slice(0, 3).map((recipe) => normalizeRecipe({
      ...recipe,
      id: recipe.id || makeId(),
      rating: recipe.rating || 0,
      memo: recipe.memo || recipe.review || "",
      createdAt: new Date().toISOString(),
      deletedAt: "",
      batchId: makeId()
    }));
    state.latestRecipes = stamped.map(cloneData);
    state.recipeHistory = [...stamped.map(cloneData), ...(state.recipeHistory || [])];
    saveState();
    elements.recipeStatus.textContent = settings.workerUrl ? "AI 추천 결과입니다. 레시피 탭에 히스토리로 저장했어요." : "현재는 로컬 추천 모드입니다. 레시피 탭에 히스토리로 저장했어요.";
  } catch (error) {
    console.error(error);
    const fallback = makeLocalRecipes(payload).map((recipe) => normalizeRecipe({
      ...recipe,
      id: makeId(),
      rating: 0,
      memo: "",
      createdAt: new Date().toISOString(),
      deletedAt: "",
      batchId: makeId()
    }));
    state.latestRecipes = fallback.map(cloneData);
    state.recipeHistory = [...fallback.map(cloneData), ...(state.recipeHistory || [])];
    saveState();
    elements.recipeStatus.textContent = "AI 연결에 실패해 로컬 추천으로 대신 보여드려요. 레시피 탭에 히스토리로 저장했어요.";
  }

  renderLatestRecipes();
  renderRecipeHistory();
}

function buildRecipePayload() {
  const selected = new Set(state.recipeMustUseIds || []);
  const ingredients = getSortedIngredientsForRecipe().map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    categoryLabel: categoryLabels[item.category],
    quantity: item.quantity,
    unit: item.unit,
    createdAt: item.createdAt,
    expiresAt: item.expiresAt,
    expiresInDays: getDaysUntil(item.expiresAt),
    mustUse: selected.has(item.id),
    memo: item.memo
  }));

  return {
    ingredients,
    request: {
      recipeCount: 3,
      mustUseIngredientIds: Array.from(selected),
      style: $("#styleSelect").value,
      timeLimit: $("#timeSelect").value,
      difficulty: $("#difficultySelect").value
    }
  };
}

async function requestRecipesFromWorker(payload) {
  const response = await fetch(settings.workerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`AI Worker error: ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data.recipes)) {
    throw new Error("AI Worker 응답에 recipes 배열이 없습니다.");
  }
  return data.recipes.slice(0, 3);
}

function makeLocalRecipes(payload) {
  const ingredients = payload.ingredients;
  const mustUse = ingredients.filter((item) => item.mustUse);
  const mains = ingredients.filter((item) => item.category === "main");
  const subs = ingredients.filter((item) => item.category === "sub");
  const sauces = ingredients.filter((item) => item.category === "sauce");

  const main = mustUse.find((item) => item.category === "main") || mains[0] || mustUse[0] || ingredients[0];
  const sub1 = mustUse.find((item) => item.category === "sub" && item.id !== main.id) || subs[0] || ingredients.find((item) => item.id !== main.id) || main;
  const sub2 = subs.find((item) => item.id !== sub1.id) || mustUse.find((item) => item.id !== main.id && item.id !== sub1.id) || sub1;
  const sauce = mustUse.find((item) => item.category === "sauce") || sauces[0] || { name: "소금", category: "sauce" };
  const sauce2 = sauces.find((item) => item.id !== sauce.id) || { name: "후추", category: "sauce" };

  const mustUseText = mustUse.length
    ? `선택한 재료 ${mustUse.map((item) => item.name).join(", ")}를 꼭 포함하도록 구성했어요.`
    : "선택 재료가 없어서 냉장고에 있는 재료를 기준으로 구성했어요.";

  return [
    {
      title: `${main.name} ${sub1.name} 간단 볶음`,
      summary: `${main.name}와 ${sub1.name}를 ${sauce.name}로 가볍게 볶는 ${payload.request.style} 메뉴입니다. ${mustUseText}`,
      usedIngredients: uniqueNames([...mustUse, main, sub1, sauce, sauce2]),
      missingOptionalIngredients: ["깨", "쪽파"],
      cookingTime: payload.request.timeLimit === "15분 이내" ? "12분" : "20분",
      difficulty: payload.request.difficulty === "보통" ? "보통" : "쉬움",
      steps: [
        `${main.name}와 ${sub1.name}를 먹기 좋은 크기로 손질합니다.`,
        `팬을 예열한 뒤 ${main.name}를 먼저 익힙니다.`,
        `${sub1.name}와 ${sauce.name}를 넣고 중불에서 볶습니다.`,
        `간을 보고 ${sauce2.name}를 더해 마무리합니다.`
      ]
    },
    {
      title: `${main.name} ${sub2.name} 덮밥`,
      summary: `밥 위에 올려 먹기 좋은 한 그릇 메뉴입니다. ${mustUseText}`,
      usedIngredients: uniqueNames([...mustUse, main, sub2, sauce]),
      missingOptionalIngredients: ["밥", "계란"],
      cookingTime: "25분",
      difficulty: "쉬움",
      steps: [
        `${main.name}를 한입 크기로 준비합니다.`,
        `${sub2.name}를 얇게 썰어 같이 볶습니다.`,
        `${sauce.name}에 물을 조금 섞어 소스를 만듭니다.`,
        `재료에 소스를 넣고 살짝 졸인 뒤 밥 위에 올립니다.`
      ]
    },
    {
      title: `${sub1.name} ${main.name} 냉장고 정리전`,
      summary: `남은 재료를 넓게 활용하는 정리형 메뉴입니다. ${mustUseText}`,
      usedIngredients: uniqueNames([...mustUse, main, sub1, sub2, sauce]),
      missingOptionalIngredients: ["부침가루", "계란"],
      cookingTime: "30분",
      difficulty: "보통",
      steps: [
        `재료를 잘게 썰어 반죽에 섞습니다.`,
        `${sauce.name}를 약간 넣어 밑간합니다.`,
        `팬에 기름을 두르고 얇게 펼쳐 굽니다.`,
        `앞뒤가 노릇해지면 꺼내 먹기 좋게 자릅니다.`
      ]
    }
  ];
}

function renderLatestRecipes() {
  if (!state.latestRecipes.length) {
    renderEmpty(elements.recipeResults, "아직 추천받은 레시피가 없어요.", "재료를 선택한 뒤 AI 추천 받기 버튼을 눌러보세요.");
    return;
  }
  elements.recipeResults.innerHTML = state.latestRecipes.map((recipe) => renderRecipeCard(recipe, "latest")).join("");
}

function renderRecipeHistory() {
  const recipes = getVisibleRecipes();
  if (!recipes.length) {
    const title = showingTrash ? "휴지통이 비어 있어요." : "레시피 히스토리가 없어요.";
    const subtitle = showingTrash ? "삭제한 레시피가 이곳에 표시됩니다." : "추천을 받으면 이곳에 자동으로 쌓입니다.";
    renderEmpty(elements.recipeHistory, title, subtitle);
    return;
  }

  elements.recipeHistory.innerHTML = recipes.map((recipe) => renderRecipeCard(recipe, "history")).join("");
}

function getVisibleRecipes() {
  const deleted = showingTrash;
  return [...(state.recipeHistory || [])]
    .filter((recipe) => Boolean(recipe.deletedAt) === deleted)
    .filter((recipe) => matchRatingFilter(recipe))
    .sort((a, b) => new Date(b.createdAt || b.savedAt || 0) - new Date(a.createdAt || a.savedAt || 0));
}

function matchRatingFilter(recipe) {
  const rating = Number(recipe.rating || 0);
  if (ratingFilter === "all") return true;
  if (ratingFilter === "5") return rating === 5;
  if (ratingFilter === "4plus") return rating >= 4;
  if (ratingFilter === "3plus") return rating >= 3;
  if (ratingFilter === "unrated") return rating === 0;
  return true;
}

function renderRecipeCard(recipe, source) {
  const isTrash = Boolean(recipe.deletedAt);
  const canEdit = source !== "latest";
  const historyActions = isTrash
    ? `
      <button class="tiny-btn success" type="button" data-action="restore-recipe" data-id="${recipe.id}">복원</button>
      <button class="tiny-btn danger" type="button" data-action="delete-recipe-forever" data-id="${recipe.id}">완전 삭제</button>
    `
    : `<button class="tiny-btn danger" type="button" data-action="trash-recipe" data-id="${recipe.id}">휴지통</button>`;

  return `
    <article class="recipe-card ${isTrash ? "deleted" : ""}">
      <div class="recipe-head">
        <div>
          <div class="recipe-title">${escapeHTML(recipe.title)}</div>
          <div class="recipe-meta">
            <span class="category-badge">${escapeHTML(recipe.cookingTime || "30분")}</span>
            <span class="category-badge">${escapeHTML(recipe.difficulty || "쉬움")}</span>
            ${recipe.createdAt ? `<span class="category-badge">${escapeHTML(formatDate(recipe.createdAt))}</span>` : ""}
          </div>
        </div>
      </div>

      <p class="recipe-summary">${escapeHTML(recipe.summary || "")}</p>

      <div class="ingredient-meta">
        <strong>사용재료</strong>
        ${(recipe.usedIngredients || []).map((name) => `<span class="category-badge">${escapeHTML(name)}</span>`).join("")}
      </div>

      ${recipe.missingOptionalIngredients?.length ? `
        <div class="ingredient-meta">
          <strong>있으면 좋음</strong>
          ${recipe.missingOptionalIngredients.map((name) => `<span class="category-badge">${escapeHTML(name)}</span>`).join("")}
        </div>
      ` : ""}

      <ol class="recipe-steps">
        ${(recipe.steps || []).map((step) => `<li>${escapeHTML(step)}</li>`).join("")}
      </ol>

      <div class="rating-box">
        <div class="star-row" aria-label="별점">
          ${[1, 2, 3, 4, 5].map((value) => `
            <button class="star-btn ${Number(recipe.rating) >= value ? "active" : ""}" type="button" data-action="rate-recipe" data-id="${recipe.id}" data-value="${value}">★</button>
          `).join("")}
        </div>
        ${canEdit ? `<textarea class="review-input" data-id="${recipe.id}" placeholder="메모를 남겨보세요. 예: 다음엔 고춧가루 추가">${escapeHTML(recipe.memo || recipe.review || "")}</textarea>` : ""}
      </div>

      ${canEdit ? `<div class="card-actions">${historyActions}</div>` : ""}
    </article>
  `;
}

function rateRecipe(id, rating) {
  const recipe = findRecipeInHistory(id);
  if (recipe) {
    recipe.rating = rating;
  }

  const latest = state.latestRecipes.find((item) => item.id === id);
  if (latest) latest.rating = rating;

  saveState();
  renderLatestRecipes();
  renderRecipeHistory();
}

function updateRecipeMemo(id, memo) {
  const recipe = findRecipeInHistory(id);
  if (!recipe) return;
  recipe.memo = memo;
  const latest = state.latestRecipes.find((item) => item.id === id);
  if (latest) latest.memo = memo;
  saveState();
}

function moveRecipeToTrash(id) {
  const recipe = findRecipeInHistory(id);
  if (!recipe) return;
  recipe.deletedAt = new Date().toISOString();
  saveState();
  renderRecipeHistory();
  toast("휴지통으로 이동했어요.");
}

function restoreRecipe(id) {
  const recipe = findRecipeInHistory(id);
  if (!recipe) return;
  recipe.deletedAt = "";
  saveState();
  renderRecipeHistory();
  toast("복원했어요.");
}

function deleteRecipeForever(id) {
  const ok = confirm("이 레시피를 완전히 삭제할까요?");
  if (!ok) return;
  state.recipeHistory = state.recipeHistory.filter((recipe) => recipe.id !== id);
  state.latestRecipes = state.latestRecipes.filter((recipe) => recipe.id !== id);
  saveState();
  renderLatestRecipes();
  renderRecipeHistory();
}

function findRecipeInHistory(id) {
  return (state.recipeHistory || []).find((recipe) => recipe.id === id);
}

function getSortedIngredientsForRecipe() {
  const selected = new Set(state.recipeMustUseIds || []);
  return [...state.ingredients].sort((a, b) => {
    if (selected.has(a.id) !== selected.has(b.id)) return selected.has(a.id) ? -1 : 1;
    return sortIngredients(a, b);
  });
}

function sortIngredients(a, b) {
  const categoryWeight = { main: 0, sub: 1, sauce: 2 };
  if (categoryWeight[a.category] !== categoryWeight[b.category]) return categoryWeight[a.category] - categoryWeight[b.category];
  const aDays = getDaysUntil(a.expiresAt) ?? 9999;
  const bDays = getDaysUntil(b.expiresAt) ?? 9999;
  if (aDays !== bDays) return aDays - bDays;
  return a.name.localeCompare(b.name, "ko");
}

function renderEmpty(target, title, subtitle) {
  if (!target) return;
  target.innerHTML = `
    <div class="empty-card surface-inset">
      <div>
        <strong>${escapeHTML(title)}</strong><br />
        <span>${escapeHTML(subtitle)}</span>
      </div>
    </div>
  `;
}

function cleanMustUseIds() {
  const validIds = new Set(state.ingredients.map((item) => item.id));
  state.recipeMustUseIds = (state.recipeMustUseIds || []).filter((id) => validIds.has(id));
}

function uniqueNames(items) {
  return [...new Set(items.filter(Boolean).map((item) => item.name).filter(Boolean))];
}

function uniqueArray(items) {
  return [...new Set(items.filter(Boolean))];
}

function getDaysUntil(dateString) {
  if (!dateString) return null;
  const today = new Date(todayISO());
  const target = new Date(String(dateString).slice(0, 10));
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target - today) / 86400000);
}

function formatDday(dateString) {
  const days = getDaysUntil(dateString);
  if (days === null) return "기한 없음";
  if (days < 0) return `D+${Math.abs(days)}`;
  if (days === 0) return "D-Day";
  return `D-${days}`;
}

function formatDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function addDaysISO(days) {
  const date = new Date(todayISO());
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function makeId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function cloneData(data) {
  if (typeof structuredClone === "function") {
    return structuredClone(data);
  }
  return JSON.parse(JSON.stringify(data));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || LEGACY_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
    const parsed = raw ? JSON.parse(raw) : cloneData(defaultState);
    return migrateState(parsed);
  } catch (error) {
    console.error(error);
    return cloneData(defaultState);
  }
}

function migrateState(parsed) {
  const ingredients = Array.isArray(parsed.ingredients) ? parsed.ingredients.map(normalizeIngredient) : [];
  const migratedMustUseIds = ingredients.filter((item) => item.useFirst).map((item) => item.id);
  const recipeMustUseIds = Array.isArray(parsed.recipeMustUseIds) ? parsed.recipeMustUseIds : migratedMustUseIds;

  const legacyGenerated = Array.isArray(parsed.generatedRecipes) ? parsed.generatedRecipes : [];
  const legacySaved = Array.isArray(parsed.savedRecipes) ? parsed.savedRecipes : [];
  const recipeHistory = Array.isArray(parsed.recipeHistory)
    ? parsed.recipeHistory.map(normalizeRecipe)
    : [...legacySaved, ...legacyGenerated].map((recipe) => normalizeRecipe({
      ...recipe,
      id: recipe.id || makeId(),
      memo: recipe.memo || recipe.review || "",
      createdAt: recipe.createdAt || recipe.savedAt || new Date().toISOString(),
      deletedAt: ""
    }));

  const latestRecipes = Array.isArray(parsed.latestRecipes)
    ? parsed.latestRecipes.map(normalizeRecipe)
    : legacyGenerated.map(normalizeRecipe);

  return {
    ingredients,
    recipeMustUseIds: uniqueArray(recipeMustUseIds),
    latestRecipes,
    recipeHistory
  };
}

function normalizeIngredient(item) {
  return {
    id: item.id || makeId(),
    name: item.name || "이름 없음",
    category: categoryLabels[item.category] ? item.category : "sub",
    quantity: Number(item.quantity || 0),
    unit: item.unit || "개",
    createdAt: item.createdAt || todayISO(),
    expiresAt: item.expiresAt || "",
    memo: item.memo || "",
    useFirst: Boolean(item.useFirst)
  };
}

function normalizeRecipe(recipe) {
  return {
    id: recipe.id || makeId(),
    title: recipe.title || "이름 없는 레시피",
    summary: recipe.summary || "",
    usedIngredients: Array.isArray(recipe.usedIngredients) ? recipe.usedIngredients : [],
    missingOptionalIngredients: Array.isArray(recipe.missingOptionalIngredients) ? recipe.missingOptionalIngredients : [],
    cookingTime: recipe.cookingTime || "30분",
    difficulty: recipe.difficulty || "쉬움",
    steps: Array.isArray(recipe.steps) ? recipe.steps : [],
    rating: Number(recipe.rating || 0),
    memo: recipe.memo || recipe.review || "",
    createdAt: recipe.createdAt || recipe.savedAt || new Date().toISOString(),
    deletedAt: recipe.deletedAt || ""
  };
}

function saveState() {
  try {
    cleanMustUseIds();
    const data = {
      ...state,
      ingredients: state.ingredients.map(({ useFirst, ...ingredient }) => ingredient)
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error(error);
    alert("브라우저 저장소에 저장하지 못했어요. 시크릿 모드이거나 저장공간이 막혀 있을 수 있습니다.");
  }
}

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { workerUrl: "" };
  } catch (error) {
    return { workerUrl: "" };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error(error);
    alert("설정을 저장하지 못했어요. 브라우저 저장소 권한을 확인해주세요.");
  }
}

function exportData() {
  const data = {
    exportedAt: new Date().toISOString(),
    app: "fridge-chef",
    state,
    settings
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `fridge-chef-backup-${todayISO()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.state || !Array.isArray(data.state.ingredients)) {
      throw new Error("지원하지 않는 백업 파일입니다.");
    }
    state = migrateState(data.state);
    settings = data.settings || settings;
    saveState();
    saveSettings();
    elements.workerUrlInput.value = settings.workerUrl || "";
    renderAll();
    toast("데이터를 가져왔어요.");
  } catch (error) {
    alert(error.message || "가져오기에 실패했습니다.");
  } finally {
    event.target.value = "";
  }
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(message) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const node = document.createElement("div");
  node.className = "toast surface-raised-small";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 1800);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js?v=6", { scope: "./" }).catch((error) => console.warn("Service worker registration failed", error));
  });
}
