-- Atualiza os templates padrao de notificacao para exibir o WhatsApp/telefone do cliente.
-- Nao sobrescreve templates personalizados que nao correspondam ao padrao antigo.

update public.notification_templates
set content = 'Atencao!

O certificado digital do cliente {cliente_nome}, CNPJ {cnpj}, vencera em {dias} dia(s).

Data de vencimento: {data_vencimento}

Telefone do cliente: {cliente_telefone}

Entre em contato com o cliente para realizar a renovacao.'
where type = 'certificate_expiring'
  and active = true
  and (
    content like '%{empresa}%'
    or content = 'Atencao!

O certificado digital do cliente {cliente_nome}, CNPJ {cnpj}, vencera em {dias} dia(s).

Data de vencimento: {data_vencimento}

Entre em contato com o cliente para realizar a renovacao.'
  );

comment on column public.clientes.whatsapp is 'Telefone WhatsApp normalizado do cliente. E exibido no corpo dos avisos internos, mas nao e usado como destinatario automatico.';
