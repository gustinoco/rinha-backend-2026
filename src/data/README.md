# Data

Espaco reservado para artefatos binarios pre-processados.

O objetivo futuro e carregar milhoes de vetores em um unico `Buffer`/`Uint8Array`,
evitando objetos grandes e dispersos em memoria. Isso reduz trabalho do GC e melhora
localidade de cache em buscas lineares de baixa latencia.
