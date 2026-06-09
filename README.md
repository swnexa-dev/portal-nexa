# Nexa Systems

Portal centralizado para login, cadastro, trial de 14 dias e acesso unificado aos sistemas da Nexa.

## Estrutura

- `frontend`: portal React/Vite com login, cadastro e home dos sistemas.
- `backend`: API Node + TypeScript + MongoDB Atlas para auth centralizado e emissao de JWT por sistema.
- `fluxio`: sistema existente que depois pode consumir o JWT emitido pela Nexa.

## Fluxo base

1. O usuario cria conta na Nexa.
2. O backend ativa `trial` de 14 dias e devolve o JWT principal do portal.
3. A home lista os sistemas e identifica se o acesso esta liberado por `trial` ou assinatura.
4. Ao clicar em um sistema, o portal chama `POST /api/systems/:systemSlug/launch`.
5. O backend emite um JWT curto de SSO e devolve a `launchUrl` com `?token=...`.
6. O sistema de destino deve validar esse token com o mesmo `JWT_SECRET`.

## Cadastro com email

1. O usuario preenche nome e email.
2. O frontend chama `POST /api/auth/register/request-code`.
3. O backend gera um codigo de 6 digitos e envia via `Resend`.
4. O usuario informa o codigo recebido por email.
5. O frontend conclui o cadastro em `POST /api/auth/register`.
6. O backend valida o codigo, cria a conta e libera a sessao.

## Variaveis de ambiente

Backend em [backend/.env.example](C:/Users/guilherme.guimaraes/Desktop/nexa-systems/backend/.env.example)

Frontend em [frontend/.env.example](C:/Users/guilherme.guimaraes/Desktop/nexa-systems/frontend/.env.example)

## Email transacional

- O backend usa `Resend` como base de envio.
- A implementacao inicial cobre confirmacao de cadastro por token.
- A mesma estrutura pode ser reutilizada para reset de senha e avisos operacionais.

## Contrato para os sistemas filhos

- Cada sistema deve aceitar o token enviado pela Nexa.
- Se o usuario acessar diretamente a URL do sistema sem token valido, o sistema deve redirecionar para o portal principal da Nexa.
- O mesmo `JWT_SECRET` pode ser usado para validar o token, ou depois voce pode evoluir para chaves separadas por servico.

## Proximos passos recomendados

- Integrar o `fluxio` para confiar no JWT central.
- Criar tabela/colecao de pagamentos e assinaturas reais.
- Adicionar renovacao, cancelamento e recuperacao de senha.
