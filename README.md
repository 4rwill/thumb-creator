# Clemilson Finanças — Thumbnail Creator

Editor de thumbnails para Instagram baseado na identidade visual da marca Clemilson Finanças.

## Desenvolvimento local

```bash
npm install
npm run dev
```

## Builds

- `npm run build`: gera o build usado pelo OpenAI Sites/Cloudflare.
- `npm run build:vercel`: gera o pacote da Vercel em `.vercel/output` usando Vinext e Nitro.

O arquivo `vercel.json` configura automaticamente o build ao importar este repositório na Vercel. O projeto não exige variáveis de ambiente no MVP atual.
