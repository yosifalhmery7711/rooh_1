const LUCK_FALLBACKS = [
  "النجاح ليس مفتاح السعادة، بل السعادة هي مفتاح النجاح. إذا كنت تحب ما تفعله، فستنجح.",
  "لا تقاس الثروة بما يملكه المرء، بل بما يمنحه للآخرين بكل حب.",
  "كل قرش تدخره اليوم هو خطوة نحو حرية غدك المالية.",
  "الديون مجرد سحابة عابرة، بالصبر والتخطيط ستشرق شمس الاستقلال المالي مجدداً.",
  "استثمر في عقلك قبل جيبك، فالمعرفة هي الأصل الذي لا يعرف الكساد.",
  "قد يكون الطريق طويلاً، لكن خطوة واحدة مدروسة تغير مسار مستقبلك بالكامل.",
  "الرزق يحب السعي، والتوفيق حليف الصابرين والمجتهدين."
];

const getBaseApiUrl = () => {
  // Use relative path so that Vercel uses its own secure server-side rewrites (vercel.json)
  return "";
};

export const getGeminiResponse = async (userPrompt: string, imageBase64?: string) => {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("هذه الخدمة تتطلب اتصالاً بالإنترنت");
  }

  const isLuckPrompt = userPrompt.includes("الحروف العربية المبعثرة");
  const baseUrl = getBaseApiUrl();
  
  // Try Groq first for text-only (non-luck) prompts as it's faster and using the desired model
  if (!imageBase64 && !isLuckPrompt) {
    try {
      const apiKey = import.meta.env.VITE_GROQ_API_KEY || "";
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['X-Groq-API-Key'] = apiKey;
      }
      const groqRes = await fetch(`${baseUrl}/api/groq`, {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt: userPrompt }),
      });
      if (groqRes.ok) {
        const data = await groqRes.json();
        if (data.text) return data.text;
      }
    } catch (e) {
      console.warn("Groq fallback to Gemini due to error:", e);
    }
  }

  try {
    const response = await fetch(`${baseUrl}/api/gemini`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: userPrompt, imageBase64 }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.text;
  } catch (error: any) {
    console.error("Gemini Proxy Error:", error);
    
    if (isLuckPrompt) {
      return LUCK_FALLBACKS[Math.floor(Math.random() * LUCK_FALLBACKS.length)];
    }

    if (error.message?.includes("API_KEY_INVALID") || error.message?.includes("PERMISSION_DENIED") || error.message?.includes("NOT_FOUND")) {
      return `عذراً، واجهت روح مشكلة في الاتصال بالخدمة الذكية (404/Auth). يرجى التأكد من إعداد مفتاح API بشكل صحيح في إعدادات المنصة واختيار موديل متاح.`;
    }

    return `عذراً، واجهت روح مشكلة تقنية بسيطة. سأحاول مجدداً فور استقرار الاتصال.`;
  }
};
