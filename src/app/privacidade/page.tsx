export const metadata = {
  title: "Política de Privacidade — ML Vendas NFe",
};

export default function PrivacidadePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 text-sm leading-relaxed text-foreground">
      <h1 className="text-xl font-bold mb-1">Política de Privacidade</h1>
      <p className="text-muted mb-6">Painel de Vendas — ML Vendas NFe</p>

      <p className="mb-4">
        Este é um aplicativo de uso interno, desenvolvido para controle de vendas, estoque e
        notas fiscais de um pequeno negócio familiar que revende produtos no Mercado Livre. Ele
        não é um serviço público e não é oferecido a terceiros.
      </p>

      <h2 className="font-semibold mt-6 mb-2">Quais dados o app acessa</h2>
      <p className="mb-4">
        Para automatizar o registro de compras de mercadoria, o app pode solicitar acesso de
        leitura (somente leitura) à caixa de entrada do Gmail dos e-mails autorizados pelos
        próprios donos do negócio. Esse acesso é usado exclusivamente para:
      </p>
      <ul className="list-disc pl-5 mb-4 space-y-1">
        <li>
          Identificar e-mails de fornecedores que contenham Notas Fiscais Eletrônicas (NF-e) em
          formato XML anexado;
        </li>
        <li>
          Extrair automaticamente os dados dessa nota (fornecedor, itens, quantidades e valores)
          para apresentar como uma pendência de conferência dentro do próprio app, antes de
          qualquer atualização real de estoque.
        </li>
      </ul>

      <h2 className="font-semibold mt-6 mb-2">O que não é feito com esses dados</h2>
      <ul className="list-disc pl-5 mb-4 space-y-1">
        <li>Os e-mails não são compartilhados, vendidos ou repassados a terceiros;</li>
        <li>Os dados não são usados para publicidade;</li>
        <li>
          Nenhum e-mail é apagado, respondido ou enviado em nome do usuário — o acesso é somente
          de leitura;
        </li>
        <li>
          Os dados extraídos ficam armazenados apenas no banco de dados privado deste aplicativo,
          usado somente pelos donos do negócio.
        </li>
      </ul>

      <h2 className="font-semibold mt-6 mb-2">Revogação de acesso</h2>
      <p className="mb-4">
        O acesso concedido ao app pode ser revogado a qualquer momento em{" "}
        <a
          href="https://myaccount.google.com/permissions"
          className="text-brand underline"
          target="_blank"
          rel="noreferrer"
        >
          myaccount.google.com/permissions
        </a>
        .
      </p>

      <h2 className="font-semibold mt-6 mb-2">Contato</h2>
      <p>
        Dúvidas sobre esta política podem ser enviadas para{" "}
        <a href="mailto:jlmhaag123@gmail.com" className="text-brand underline">
          jlmhaag123@gmail.com
        </a>
        .
      </p>
    </div>
  );
}
