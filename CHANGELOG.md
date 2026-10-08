# Changelog

## [1.0.0] — 2026-10-08

### Adicionado
- Pacote de instalação: `.env.example`, `npm run setup`, Dockerfile, docker-compose, Nginx, reapontamento de agendamentos.
- Documentação: instalação, variáveis, implantação em VPS, backup e situação das funcionalidades.
- Cotações de compra com itens, fluxo de situação e permissões por empresa.
- Ficha de materiais na ordem de produção, com baixa automática na conclusão.
- Fila de acompanhamento de transmissões fiscais por empresa.

### Alterado
- Conclusão da OP lança apenas a quantidade aprovada, na empresa e unidade corretas, sem duplicidade.
- Paleta laranja suavizada e contraste dos menus da barra superior.
- Endereço do webhook de pagamentos passa a vir da configuração do ambiente.

### Segurança
- Emissões fiscais, PIX e boletos falham com segurança quando o provedor não está configurado (sem documentos ou cobranças simuladas).
