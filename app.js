const STORAGE_KEY = "fridge-chef-state-v1";
const SETTINGS_KEY = "fridge-chef-settings-v1";

const categoryLabels = {
  main: "메인재료",
  sub: "서브재료",
  sauce: "소스류"
};

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
  generatedRecipes: [],
  savedRecipes: []
};

defaultState.recipeMustUseIds = [defaultState.ingredients[0].id];

let state = loadState();
let settings = loadSettings();
let currentFilter = "all";
let currentSearch = "";

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
    openIngredientBtn: $("#openIngredientBtn"),
    openIngredientBtn2: $("#openIngredientBtn2"),
    ingredientModal: $("#ingredientModal"),
    closeIngredientModal: $("#closeIngredientModal"),
    ingredientForm: $("#ingredientForm"),
    toggleExpireBtn: $("#toggleExpireBtn"),
    expireField: $("#expireField"),
    expiresInput: $("#expiresInput"),
    ingredientList: $("#ingredientList"),
    urgentIngredients: $("#urgentIngredients"),
    priorityPicker: $("#priorityPicker"),
    totalCount: $("#totalCount"),
    soonCount: $("#soonCount"),
    useFirstCount: $("#useFirstCount"),
    ingredientSearch: $("#ingredientSearch"),
    recipeResults: $("#recipeResults"),
    savedRecipes: $("#savedRecipes"),
    recipeStatus: $("#recipeStatus"),
    quickRecommendBtn: $("#quickRecommendBtn"),
    homeRecommendBtn: $("#homeRecommendBtn"),
    recipeRecommendBtn: $("#recipeRecommendBtn"),
    markAllSoonBtn: $("#markAllSoonBtn"),
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

  on(elements.openIngredientBtn, "click", openIngredientModal);
  on(elements.openIngredientBtn2, "click", openIngredientModal);
  on(elements.closeIngredientModal, "click", closeIngredientModal);
  on(elements.toggleExpireBtn, "click", toggleExpireField);
  on(elements.ingredientForm, "submit", handleIngredientSubmit);

  $$(".segment").forEach((button) => {
    button.addEventListener("click", () => {
      currentFilter = button.dataset.filter;
      $$(".segment").forEach((item) => item.classList.toggle("active", item === button));
      renderIngredients();
    });
  });

  on(elements.ingredientSearch, "input", (event) => {
    currentSearch = event.target.value.trim().toLowerCase();
    renderIngredients();
  });

  on(elements.quickRecommendBtn, "click", generateRecipesAndOpen);
  on(elements.homeRecommendBtn, "click", generateRecipesAndOpen);
  on(elements.recipeRecommendBtn, "click", generateRecipes);

  on(elements.markAllSoonBtn, "click", () => {
    const urgentIds = state.ingredients
      .filter((ingredient) => {
        const days = getDaysUntil(ingredient.expiresAt);
        return days !== null && days <= 3;
      })
      .map((ingredient) => ingredient.id);

    state.recipeMustUseIds = uniqueArray([...(state.recipeMustUseIds || []), ...urgentIds]);
    saveState();
    renderAll();
    toast(urgentIds.length ? "임박 재료를 이번 추천에 포함했어요." : "D-3 이하 재료가 없어요.");
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
    state = { ingredients: [], recipeMustUseIds: [], generatedRecipes: [], savedRecipes: [] };
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
  elements.tabs.forEach((button) => button.classList.toggle("active", button.dataset.tab === tabName));
  elements.panels.forEach((panel) => panel.classList.toggle("active", panel.id === `tab-${tabName}`));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openIngredientModal() {
  resetIngredientForm();
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

  const ingredient = {
    id: makeId(),
    name,
    category: $("#categoryInput").value,
    quantity: Number($("#quantityInput").value || 0),
    unit: $("#unitInput").value.trim() || "개",
    createdAt: todayISO(),
    expiresAt: elements.expireField.classList.contains("hidden") ? "" : elements.expiresInput.value,
    memo: $("#memoInput").value.trim()
  };

  const duplicate = state.ingredients.find((item) => item.name === ingredient.name && item.category === ingredient.category && item.unit === ingredient.unit);

  if (duplicate) {
    duplicate.quantity = Number(duplicate.quantity) + Number(ingredient.quantity);
    duplicate.expiresAt = ingredient.expiresAt || duplicate.expiresAt;
    duplicate.memo = ingredient.memo || duplicate.memo;
  } else {
    state.ingredients.push(ingredient);
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
  if (action === "select-for-recipe") toggleRecipeMustUse(id);
  if (action === "delete-ingredient") deleteIngredient(id);
  if (action === "save-recipe") saveRecipe(id);
  if (action === "delete-saved-recipe") deleteSavedRecipe(id);
  if (action === "rate-recipe") rateRecipe(id, Number(button.dataset.value), button.dataset.source);
}

function handleDynamicInput(event) {
  if (event.target.matches("[data-action='toggle-recipe-ingredient']")) {
    toggleRecipeMustUse(event.target.dataset.id, event.target.checked);
  }

  if (event.target.matches(".review-input")) {
    const source = event.target.dataset.source;
    const id = event.target.dataset.id;
    updateReview(id, event.target.value, source);
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
  renderAll();
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
  renderSummary();
  renderUrgentIngredients();
  renderPriorityPicker();
  renderIngredients();
  renderRecipes();
  renderSavedRecipes();
}

function renderSummary() {
  const soon = state.ingredients.filter((item) => {
    const days = getDaysUntil(item.expiresAt);
    return days !== null && days <= 3;
  });

  elements.totalCount.textContent = state.ingredients.length;
  elements.soonCount.textContent = soon.length;
  elements.useFirstCount.textContent = (state.recipeMustUseIds || []).length;
}

function renderUrgentIngredients() {
  const urgent = [...state.ingredients]
    .filter((item) => {
      const days = getDaysUntil(item.expiresAt);
      return days !== null && days <= 7;
    })
    .sort((a, b) => (getDaysUntil(a.expiresAt) ?? 999) - (getDaysUntil(b.expiresAt) ?? 999));

  if (!urgent.length) {
    renderEmpty(elements.urgentIngredients, "유통기한이 임박한 재료가 없어요.", "유통기한을 입력하면 D-day가 표시됩니다.");
    return;
  }

  elements.urgentIngredients.innerHTML = urgent.map((item) => {
    const days = getDaysUntil(item.expiresAt);
    return `
      <span class="chip ${days <= 3 ? "danger" : ""}">
        ${escapeHTML(item.name)}
        <small>${formatDday(item.expiresAt)}</small>
      </span>
    `;
  }).join("");
}

function renderPriorityPicker() {
  if (!state.ingredients.length) {
    renderEmpty(elements.priorityPicker, "이번 추천에 포함할 재료가 아직 없어요.", "재료를 추가한 뒤 원하는 재료를 직접 체크해보세요.");
    return;
  }

  const sorted = getSortedIngredientsForRecipe();
  const selected = new Set(state.recipeMustUseIds || []);
  elements.priorityPicker.innerHTML = sorted.map((item) => `
    <label class="check-chip ${selected.has(item.id) ? "active" : ""}">
      <input type="checkbox" data-action="toggle-recipe-ingredient" data-id="${item.id}" ${selected.has(item.id) ? "checked" : ""} />
      <span>${escapeHTML(item.name)}</span>
      <small>${item.expiresAt ? formatDday(item.expiresAt) : categoryLabels[item.category]}</small>
    </label>
  `).join("");
}

function renderIngredients() {
  const filtered = state.ingredients
    .filter((item) => currentFilter === "all" || item.category === currentFilter)
    .filter((item) => !currentSearch || item.name.toLowerCase().includes(currentSearch) || (item.memo || "").toLowerCase().includes(currentSearch))
    .sort((a, b) => {
      const aDays = getDaysUntil(a.expiresAt) ?? 9999;
      const bDays = getDaysUntil(b.expiresAt) ?? 9999;
      if (aDays !== bDays) return aDays - bDays;
      return a.name.localeCompare(b.name, "ko");
    });

  if (!filtered.length) {
    renderEmpty(elements.ingredientList, "조건에 맞는 재료가 없어요.", "상단의 + 추가 버튼으로 재료를 넣어보세요.");
    return;
  }

  elements.ingredientList.innerHTML = filtered.map(renderIngredientCard).join("");
}

function renderIngredientCard(item) {
  const days = getDaysUntil(item.expiresAt);
  const ddayClass = days !== null && days <= 3 ? "danger" : "safe";
  const selected = (state.recipeMustUseIds || []).includes(item.id);
  return `
    <article class="ingredient-card">
      <div class="ingredient-head">
        <div>
          <div class="ingredient-name">${escapeHTML(item.name)}</div>
          <div class="ingredient-meta">
            <span class="category-badge">${categoryLabels[item.category]}</span>
            <span class="d-day-badge ${item.expiresAt ? ddayClass : ""}">${item.expiresAt ? formatDday(item.expiresAt) : "기한 없음"}</span>
          </div>
        </div>
      </div>

      ${item.memo ? `<p class="recipe-summary">${escapeHTML(item.memo)}</p>` : ""}

      <div class="quantity-row">
        <button class="qty-btn" type="button" data-action="decrease" data-id="${item.id}">−</button>
        <div class="qty-value">${item.quantity}${escapeHTML(item.unit)}</div>
        <button class="qty-btn" type="button" data-action="increase" data-id="${item.id}">+</button>
      </div>

      <div class="card-actions">
        <button class="tiny-btn ${selected ? "active" : ""}" type="button" data-action="select-for-recipe" data-id="${item.id}">
          ${selected ? "추천에 포함됨" : "이번 추천에 포함"}
        </button>
        <button class="tiny-btn danger" type="button" data-action="delete-ingredient" data-id="${item.id}">삭제</button>
      </div>
    </article>
  `;
}

async function generateRecipesAndOpen() {
  await generateRecipes();
  if (state.ingredients.length) switchTab("recipes");
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
    state.generatedRecipes = recipes.map((recipe) => ({
      ...recipe,
      id: recipe.id || makeId(),
      rating: recipe.rating || 0,
      review: recipe.review || "",
      createdAt: new Date().toISOString()
    }));
    saveState();
    elements.recipeStatus.textContent = settings.workerUrl ? "AI 추천 결과입니다." : "현재는 로컬 추천 모드입니다. Worker URL을 넣으면 AI 추천으로 전환됩니다.";
  } catch (error) {
    console.error(error);
    state.generatedRecipes = makeLocalRecipes(payload).map((recipe) => ({ ...recipe, id: makeId(), rating: 0, review: "", createdAt: new Date().toISOString() }));
    saveState();
    elements.recipeStatus.textContent = "AI 연결에 실패해 로컬 추천으로 대신 보여드려요.";
  }

  renderRecipes();
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
    : "선택 재료가 없어서 유통기한과 재료 분류를 기준으로 구성했어요.";

  const candidates = [
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
        `팬에 기름을 두르고 얇게 펼쳐 굽습니다.`,
        `앞뒤가 노릇해지면 꺼내 먹기 좋게 자릅니다.`
      ]
    }
  ];

  return candidates.slice(0, 3).map((recipe) => ({
    id: makeId(),
    ...recipe,
    rating: 0,
    review: ""
  }));
}

function renderRecipes() {
  if (!state.generatedRecipes.length) {
    renderEmpty(elements.recipeResults, "아직 추천받은 레시피가 없어요.", "원하는 재료를 체크한 뒤 추천 받기 버튼을 눌러보세요.");
    return;
  }

  elements.recipeResults.innerHTML = state.generatedRecipes.map((recipe) => renderRecipeCard(recipe, "generated")).join("");
}

function renderSavedRecipes() {
  if (!state.savedRecipes.length) {
    renderEmpty(elements.savedRecipes, "저장한 레시피가 없어요.", "마음에 드는 추천 레시피를 저장해보세요.");
    return;
  }

  elements.savedRecipes.innerHTML = [...state.savedRecipes]
    .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))
    .map((recipe) => renderRecipeCard(recipe, "saved"))
    .join("");
}

function renderRecipeCard(recipe, source) {
  const isSavedSource = source === "saved";
  const actionButton = isSavedSource
    ? `<button class="tiny-btn danger" type="button" data-action="delete-saved-recipe" data-id="${recipe.id}">저장 삭제</button>`
    : `<button class="tiny-btn" type="button" data-action="save-recipe" data-id="${recipe.id}">저장하기</button>`;

  return `
    <article class="recipe-card">
      <div class="recipe-head">
        <div>
          <div class="recipe-title">${escapeHTML(recipe.title)}</div>
          <div class="recipe-meta">
            <span class="category-badge">${escapeHTML(recipe.cookingTime || "30분")}</span>
            <span class="category-badge">${escapeHTML(recipe.difficulty || "쉬움")}</span>
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
            <button class="star-btn ${Number(recipe.rating) >= value ? "active" : ""}" type="button" data-action="rate-recipe" data-id="${recipe.id}" data-source="${source}" data-value="${value}">★</button>
          `).join("")}
        </div>
        <textarea class="review-input" data-id="${recipe.id}" data-source="${source}" placeholder="먹어본 후기나 다음에 바꿀 점을 적어보세요.">${escapeHTML(recipe.review || "")}</textarea>
      </div>

      <div class="card-actions">
        ${actionButton}
      </div>
    </article>
  `;
}

function saveRecipe(id) {
  const recipe = state.generatedRecipes.find((item) => item.id === id);
  if (!recipe) return;

  const alreadySaved = state.savedRecipes.some((item) => item.sourceId === id || item.title === recipe.title);
  if (alreadySaved) {
    toast("이미 저장된 레시피예요.");
    return;
  }

  state.savedRecipes.push({
    ...cloneData(recipe),
    id: makeId(),
    sourceId: id,
    savedAt: new Date().toISOString()
  });
  saveState();
  renderSavedRecipes();
  toast("레시피를 저장했어요.");
}

function deleteSavedRecipe(id) {
  const ok = confirm("저장한 레시피를 삭제할까요?");
  if (!ok) return;
  state.savedRecipes = state.savedRecipes.filter((recipe) => recipe.id !== id);
  saveState();
  renderSavedRecipes();
}

function rateRecipe(id, rating, source) {
  const collection = source === "saved" ? state.savedRecipes : state.generatedRecipes;
  const recipe = collection.find((item) => item.id === id);
  if (!recipe) return;
  recipe.rating = rating;
  saveState();
  if (source === "saved") renderSavedRecipes();
  else renderRecipes();
}

function updateReview(id, review, source) {
  const collection = source === "saved" ? state.savedRecipes : state.generatedRecipes;
  const recipe = collection.find((item) => item.id === id);
  if (!recipe) return;
  recipe.review = review;
  saveState();
}

function getSortedIngredientsForRecipe() {
  const selected = new Set(state.recipeMustUseIds || []);
  return [...state.ingredients].sort((a, b) => {
    if (selected.has(a.id) !== selected.has(b.id)) return selected.has(a.id) ? -1 : 1;
    const aDays = getDaysUntil(a.expiresAt) ?? 9999;
    const bDays = getDaysUntil(b.expiresAt) ?? 9999;
    if (aDays !== bDays) return aDays - bDays;
    const categoryWeight = { main: 0, sub: 1, sauce: 2 };
    if (categoryWeight[a.category] !== categoryWeight[b.category]) return categoryWeight[a.category] - categoryWeight[b.category];
    return a.name.localeCompare(b.name, "ko");
  });
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
  const target = new Date(dateString);
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
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : cloneData(defaultState);
    const ingredients = Array.isArray(parsed.ingredients) ? parsed.ingredients.map(normalizeIngredient) : [];
    const migratedMustUseIds = ingredients.filter((item) => item.useFirst).map((item) => item.id);
    const recipeMustUseIds = Array.isArray(parsed.recipeMustUseIds)
      ? parsed.recipeMustUseIds
      : migratedMustUseIds;

    return {
      ingredients,
      recipeMustUseIds: uniqueArray(recipeMustUseIds),
      generatedRecipes: Array.isArray(parsed.generatedRecipes) ? parsed.generatedRecipes : [],
      savedRecipes: Array.isArray(parsed.savedRecipes) ? parsed.savedRecipes : []
    };
  } catch (error) {
    console.error(error);
    return cloneData(defaultState);
  }
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
    state = {
      ingredients: data.state.ingredients.map(normalizeIngredient),
      recipeMustUseIds: uniqueArray(data.state.recipeMustUseIds || data.state.ingredients.filter((item) => item.useFirst).map((item) => item.id)),
      generatedRecipes: Array.isArray(data.state.generatedRecipes) ? data.state.generatedRecipes : [],
      savedRecipes: Array.isArray(data.state.savedRecipes) ? data.state.savedRecipes : []
    };
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
  Object.assign(node.style, {
    position: "fixed",
    left: "50%",
    bottom: "96px",
    transform: "translateX(-50%)",
    padding: "14px 18px",
    borderRadius: "16px",
    background: "#E0E5EC",
    color: "#3D4852",
    fontWeight: "900",
    zIndex: "9999"
  });
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 1800);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js?v=5", { scope: "./" }).catch((error) => console.warn("Service worker registration failed", error));
  });
}
