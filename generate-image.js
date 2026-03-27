import { GoogleGenAI } from "@google/genai";
import fs from "fs";

async function generate() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-image-preview',
    contents: {
      parts: [
        {
          text: 'Imagem publicitária realista para a hamburgueria "Divino Sabor", mostrando delivery rápido com motoboy em moto moderna, bag personalizada com o nome Divino Sabor, hambúrguer artesanal, batata com queijo e bacon e refrigerante em destaque, luz dourada, clima acolhedor, temática evangélica sutil, estilo moderno, profissional e chamativo, com a frase: "Delivery rápido com sabor e propósito".',
        },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio: "16:9",
        imageSize: "1K"
      }
    },
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      const base64EncodeString = part.inlineData.data;
      fs.writeFileSync("public/delivery-rapido.png", Buffer.from(base64EncodeString, 'base64'));
      console.log("Image saved to public/delivery-rapido.png");
      break;
    }
  }
}

generate().catch(console.error);
