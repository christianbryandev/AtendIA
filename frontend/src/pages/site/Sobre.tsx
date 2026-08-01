import Container from '../../components/ui/Container';

export default function Sobre() {
  return (
    <Container className="py-20">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-ink-800 sm:text-4xl">
          Sobre o AtendIA
        </h1>
        <div className="mt-8 space-y-5 text-ink-600 leading-relaxed">
          <p>
            O AtendIA nasceu de uma observação simples: em todo delivery, alguém
            passa o dia inteiro digitando as mesmas respostas no WhatsApp.
            Anotando pedido, informando preço, calculando troco. Enquanto isso, o
            cliente que mandou mensagem há dez minutos já pediu em outro lugar.
          </p>
          <p>
            A proposta é tirar esse trabalho repetitivo do caminho. A
            inteligência artificial atende, entende texto e áudio, monta o pedido
            com os preços reais do cardápio e entrega tudo pronto no painel da
            cozinha. O time do restaurante volta a fazer o que só ele sabe:
            cozinhar bem e cuidar do cliente.
          </p>
          <p>
            Somos uma empresa brasileira, pequena e independente, feita para
            restaurantes brasileiros. Quem responde o suporte é quem escreve o
            código.
          </p>
        </div>

        <div className="mt-12 rounded-lg border border-stone-200 bg-stone-50 p-6 text-sm text-ink-600">
          <h2 className="font-semibold text-ink-800">Dados da empresa</h2>
          <p className="mt-3">67.146.802 CHRISTIAN BRYAN PEREIRA</p>
          <p>CNPJ 67.146.802/0001-85</p>
          <p>Ribeirão Preto — São Paulo</p>
          <p className="mt-3">
            <a href="mailto:christianpereira.mtx@gmail.com" className="font-medium text-brand-700">
              christianpereira.mtx@gmail.com
            </a>
          </p>
        </div>
      </div>
    </Container>
  );
}
