exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Método não permitido." }) };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "A variável OPENAI_API_KEY não está configurada na Netlify." }) };
  }

  let input;
  try { input = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Pedido inválido." }) }; }

  const business = String(input.business || "").slice(0, 100);
  const type = String(input.type || "Site institucional").slice(0, 80);
  const brief = String(input.brief || "").slice(0, 5000);
  if (!business || !brief) {
    return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Informe o nome do negócio e a descrição." }) };
  }

  const instructions = `Você é um gerador de sites. Retorne SOMENTE JSON válido no formato {"files":{"index.html":"...","styles.css":"...","script.js":"..."}}. Crie arquivos completos e funcionais, responsivos, acessíveis e sem dependências de build. O index.html deve referenciar styles.css e script.js. Não inclua chaves, pagamentos reais, dados pessoais, conteúdo executável remoto nem alegações de que testes foram feitos. Se houver botão de compra/pagamento, deixe como demonstração sem cobrar. O conteúdo deve estar em português brasileiro.`;

  const userPrompt = `Crie um site do tipo "${type}" para "${business}". Requisitos do usuário:\n${brief}\n\nRetorne os três arquivos index.html, styles.css e script.js completos.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: userPrompt }
        ]
      })
    });

    const result = await response.json();
    if (!response.ok) {
      const message = result?.error?.message || "Falha ao chamar a API OpenAI.";
      return { statusCode: response.status === 429 ? 429 : 502, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: message }) };
    }

    const raw = result?.choices?.[0]?.message?.content;
    if (!raw) throw new Error("A API não retornou conteúdo.");
    const parsed = JSON.parse(raw);
    const allowed = ["index.html", "styles.css", "script.js"];
    const files = {};
    for (const name of allowed) {
      if (typeof parsed.files?.[name] !== "string") throw new Error(`Arquivo ausente ou inválido: ${name}`);
      files[name] = parsed.files[name];
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ files })
    };
  } catch (error) {
    return { statusCode: 502, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: error.message || "Erro ao gerar arquivos." }) };
  }
};
