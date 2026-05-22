import { GoogleGenAI } from "@google/genai";

let genAI: GoogleGenAI | null = null;

const getAI = () => {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set in environment variables");
    }
    genAI = new GoogleGenAI({ 
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return genAI;
};

export const generateGeminiContent = async (userPrompt: string, imageBase64?: string) => {
  try {
    const ai = getAI();
    
    let parts: any[] = [{ text: userPrompt }];
    if (imageBase64) {
      const match = imageBase64.match(/^data:(.+);base64,(.+)$/);
      if (match) {
        parts = [
          { inlineData: { mimeType: match[1], data: match[2] } },
          { text: userPrompt }
        ];
      } else {
        // Fallback if not a data URL
        parts = [
          { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
          { text: userPrompt }
        ];
      }
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [{ parts }],
      config: {
        systemInstruction: "أنت (روح الذكية)، المساعد الذكي والمتطور لتطبيق (حساب روح). مهمتك هي حل المسائل الرياضية أو الإجابة على الاستفسارات بدقة واختصار. ابدأ مباشرة في الإجابة دون أي ترحيب أو مقدمات. قدم حلاً خطوة بخطوة بلغة عربية سليمة. لا تضف أي نصوص ترويجية أو ترحيبية في البداية أو النهاية. هام: لا تستخدم علامات الدولار ($) حول الأرقام أو المعادلات."
      }
    });

    if (response.text) {
      return response.text;
    }
    
    throw new Error("Response text is empty");
  } catch (error: any) {
    console.error("Gemini SDK Error:", error);
    throw error;
  }
};
