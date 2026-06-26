export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/api/recipe" || request.method !== "POST") {
      return json({ error: "Not found" }, 404);
    }

    try {
      const body = await request.json();
      const recipes = await requestOpenAI(body, env.OPENAI_API_KEY);
      return json({ recipes });
    } catch (error) {
      return json({ error: error.message || "Recipe generation failed" }, 500);
    }
  }
};

async function requestOpenAI(payload, apiKey) {
  if (!apiKey) throw new Error("OPENAI_API_KEY 환경변수가 없습니다.");

  const prompt = buildPrompt(payload);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "너는 냉장고 재료 기반으로 실용적인 한국어 집밥 레시피를 제안하는 요리 도우미야. 반드시 JSON만 응답해."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API 오류: ${response.status} ${text}`);
  }

  const data = await response.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
  if (!Array.isArray(parsed.recipes)) {
    throw new Error("AI 응답에 recipes 배열이 없습니다.");
  }
  return parsed.recipes.slice(0, 3);
}

function buildPrompt(payload) {
  return `
현재 냉장고 재료를 기준으로 레시피 2~3개를 추천해줘.

조건:
- mustUse가 true인 재료는 유통기한과 관계없이 반드시 포함
- mustUse가 true인 재료가 없을 때만 유통기한이 가까운 재료를 우선 고려
- 한국어로 작성
- 너무 거창한 요리보다 실제 집에서 가능한 메뉴
- 부족한 재료는 missingOptionalIngredients에만 넣고, 필수 재료처럼 강요하지 말 것
- 아래 JSON 스키마로만 응답

요청 옵션:
${JSON.stringify(payload.request, null, 2)}

재료 목록:
${JSON.stringify(payload.ingredients, null, 2)}

응답 형식:
{
  "recipes": [
    {
      "title": "레시피명",
      "summary": "요약",
      "usedIngredients": ["재료명"],
      "missingOptionalIngredients": ["있으면 좋은 재료"],
      "cookingTime": "20분",
      "difficulty": "쉬움",
      "steps": ["1단계", "2단계", "3단계"]
    }
  ]
}
`;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders()
    }
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
