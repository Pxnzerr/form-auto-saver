# Form Auto-Saver

Extensão leve para navegadores baseados no Chromium (Google Chrome, Microsoft Edge, Brave) construída em **Manifest V3** e **JavaScript puro (Vanilla JS)**.

O objetivo do projeto é resolver uma dor comum da navegação na web: a **perda acidental de textos longos digitados em formulários** devido a recarregamento involuntário da página, expiração de sessão ou fechamento da aba.

---

## Como Funciona

- **Salvamento Automático em Segundo Plano**: Monitora campos de texto (`<textarea>`, `<input>` e elementos com `contenteditable`) e salva os rascunhos localmente com *debounce* de 500ms para evitar consumo desnecessário de disco.
- **Restauração Rápida**: Pelo popup da extensão, você visualiza os rascunhos salvos para a página atual e pode restaurá-los de volta no formulário com apenas um clique.
- **Cópia Instantânea**: Botão para copiar o texto integral para a área de transferência.
- **Filtro de Privacidade e Segurança**: Campos de senha (`type="password"`) e termos sensíveis relacionados a cartões de crédito, CVV, tokens e autenticação são **bloqueados por padrão** e nunca salvos.
- **100% Local**: Nenhum dado é enviado para servidores externos. Tudo fica armazenado no `chrome.storage.local` do seu próprio navegador.
- **Manutenção Automática**: Rascunhos sem atualização há mais de 7 dias são excluídos automaticamente.

---

## Estrutura do Projeto

```text
├── manifest.json       # Configuração da extensão (Manifest V3)
├── content.js          # Script que detecta digitação e injeta textos salvos
├── popup.html          # Estrutura visual do popup
├── popup.css           # Estilos minimalistas em preto e branco (Dark & Light)
├── popup.js            # Lógica de listagem, cópia e restauração
├── background.js       # Service Worker com alarme diário de limpeza (TTL)
├── icons/              # Ícones nos tamanhos 16, 32, 48 e 128 px
├── store_assets/       # Recursos visuais para publicação
└── test_form.html      # Página interativa para testes locais
```

---

## Como Instalar e Usar

1. Clone ou baixe este repositório:
   ```bash
   git clone https://github.com/Pxnzerr/form-auto-saver.git
   ```
2. Abra o navegador e acesse a página de extensões:
   - **Chrome**: `chrome://extensions`
   - **Edge**: `edge://extensions`
   - **Brave**: `brave://extensions`
3. Ative a opção **"Modo do desenvolvedor"** no canto superior direito.
4. Clique em **"Carregar sem compactação"** (*Load unpacked*) e selecione a pasta do projeto.
5. Pronto! Fixe o ícone na barra do navegador para acessar seus rascunhos a qualquer momento.

---

## Testando Localmente

Para testar o funcionamento imediatamente, abra o arquivo `test_form.html` no seu navegador, digite qualquer texto nos campos demonstrativos e abra o popup da extensão.
