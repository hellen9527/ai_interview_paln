# 题库内容维护说明

本题库是 **24 道原创训练种子，全部待领域专家审核**。来源链接已于 2026-10-10 浏览核验，但链接可访问、原论文存在，不代表每道题已经通过技术审校。`reviewed` 全部为 `false`；界面应显示“训练种子 · 待审核”，不得写“专家审核题库”“外企真题”或“官方标准答案”。

## 内容范围与当前分布

| 分类    | 题数 | 使用范围                                 |
| ------- | ---: | ---------------------------------------- |
| ML 基础 |    4 | 泄漏、分类指标、数据划分、概率校准       |
| NLP     |    4 | 注意力、BERT、子词、双编码器与交叉编码器 |
| 检索    |    4 | BM25、稀疏/稠密、混合融合、排序指标      |
| RAG     |    4 | 流程、故障定位、上下文预算、证据支持     |
| 搜广推  |    4 | 两阶段架构、离线/线上、点击偏差、DLRM    |
| CV      |    2 | 扩展方向：ViT、残差连接                  |
| 语音    |    1 | 扩展方向：WER                            |
| AI 视频 |    1 | 扩展方向：时序一致性                     |

`minutes` 是一轮“回答、查看反馈、复述、追问”的建议练习时长，不是答案朗读时长。分类服务于浏览，一道题可以适用于多个岗位。CV、语音和视频只作明确标注的扩展样例，不表示这些岗位已经获得完整覆盖。

## 字段约定

数据位于 `src/data/questions.ts`，通过 `import type { Question } from '../types'` 引用类型并导出 `questions`。

- `id`：稳定标识，用于记录和复习关联。小幅修订不要更换 ID；改变考察能力或核心含义时新建题目。
- `question` / `translation`：英文主问题及中文含义；不是逐词硬译。
- `answer`：简短口语参考，是一种可接受的答法，不是唯一正确答案。解释型答案不编造经验；方案型答案使用 “I would” 等假设表达。
- `points`：中文内容检查点。应按语义覆盖评审，允许合并表达、合理替代方案、术语同义词；不能要求照着参考答案背诵。
- `followups`：英文追问，用于解释、约束变化与迁移，不能只检查记忆原句。
- `sourceUrl`：主要原始论文、官方文档或教材链接；原理依据与工程建议需区分。
- `reviewed`：内容是否经过记录在案的领域专家审校。真实审校完成前必须保持 `false`。

## 技术审校与评分边界

发布为正式题目前，审核人需核对主问题、参考答法、每个检查点和追问，记录姓名或内部审核标识、日期、来源版本、可接受替代解法、严重错误和适用条件。当前类型没有这些审核元数据，升级正式题库时需要新增审核台账或版本化内容管理，不能只把布尔值批量改为 `true`。

当前参考答案是基于来源的原创教学归纳；例如排错顺序、人工抽检、上线实验检查是工程建议，不声称都是论文作者给出的固定流程。模型反馈必须允许用户质疑，低置信度先澄清，不将术语识别错误直接判成技术错误。

特别容易误判的内容：

1. 不均衡分类没有全场景唯一最佳指标；Precision/Recall 与阈值受错误代价影响，不能断言 PR 曲线永远优于 ROC。
2. 时间划分与用户分组取决于要估计的泛化场景，不能要求所有推荐数据都按用户隔离。
3. 校准与排序不同；Brier score 和 log loss 同时受多个性质影响，不能仅凭单项下降声称校准改善。
4. 稠密检索、交叉编码器、RRF、ViT 都不保证优于替代方案；要按同一测试集、预算和场景比较。
5. Recall@K 在检索与单正例推荐里可能使用不同口径；必须明确分母、标注范围、宏/微平均及无相关项查询处理。
6. 长上下文的位置敏感性是已发表研究中的观察，不是所有当前模型都会同样失败的定律。
7. RAG 的“忠实于上下文”不等于事实正确；有引用也不代表引用支持论断，自动评审和自我反思均可能出错。
8. 逆倾向加权依赖假设、曝光覆盖和倾向估计；不得表述为可无条件消除所有点击偏差。
9. WER 可以超过 1；分母是参考词数。WER 不是发音分，语音转写正确也不能证明音素发音准确。
10. 视频的静止不等于时序建模好；需要分别检查身份保持、运动合理性和与文本条件的一致性。

技术内容、表达清晰度和借助提示程度应分别记录。训练页面不要把这些种子提供的检查点包装成通过外企面试的概率或资格结论。

## 来源索引

以下链接在核验日均成功打开。`stable` 文档以后可能变动，正式审核时需保留当时版本或快照信息。

| 题目 ID                         | 主要来源                                                                                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ml-data-leakage`               | [scikit-learn：Common pitfalls](https://scikit-learn.org/stable/common_pitfalls.html)                                                                                             |
| `ml-imbalanced-metrics`         | [scikit-learn：Metrics and scoring](https://scikit-learn.org/stable/modules/model_evaluation.html)                                                                                |
| `ml-validation-split`           | [scikit-learn：Cross-validation](https://scikit-learn.org/stable/modules/cross_validation.html)                                                                                   |
| `ml-calibration`                | [scikit-learn：Probability calibration](https://scikit-learn.org/stable/modules/calibration.html)                                                                                 |
| `nlp-self-attention`            | [Attention Is All You Need](https://arxiv.org/abs/1706.03762)                                                                                                                     |
| `nlp-bert-objective`            | [BERT](https://arxiv.org/abs/1810.04805)                                                                                                                                          |
| `nlp-subword-tokenization`      | [Hugging Face：Tokenization algorithms](https://huggingface.co/docs/transformers/tokenizer_summary)                                                                               |
| `nlp-bi-cross-encoder`          | [Sentence-BERT](https://arxiv.org/abs/1908.10084)                                                                                                                                 |
| `retrieval-bm25`                | [Elasticsearch：Similarity settings](https://www.elastic.co/docs/reference/elasticsearch/index-settings/similarity)                                                               |
| `retrieval-sparse-dense`        | [Dense Passage Retrieval](https://arxiv.org/abs/2004.04906)                                                                                                                       |
| `retrieval-hybrid-rrf`          | [Elasticsearch：Reciprocal rank fusion](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reciprocal-rank-fusion)                                                     |
| `retrieval-ranking-metrics`     | [Stanford IR book：Evaluation of ranked retrieval](https://nlp.stanford.edu/IR-book/html/htmledition/evaluation-of-ranked-retrieval-results-1.html)                               |
| `rag-core-flow`                 | [Retrieval-Augmented Generation](https://arxiv.org/abs/2005.11401)                                                                                                                |
| `rag-error-isolation`           | [Ragas](https://arxiv.org/abs/2309.15217)                                                                                                                                         |
| `rag-context-budget`            | [Lost in the Middle](https://arxiv.org/abs/2307.03172)                                                                                                                            |
| `rag-support-check`             | [Self-RAG](https://arxiv.org/abs/2310.11511)                                                                                                                                      |
| `recommendation-two-stage`      | [Google Research：Deep Neural Networks for YouTube Recommendations](https://research.google/pubs/deep-neural-networks-for-youtube-recommendations/)                               |
| `recommendation-offline-online` | [Microsoft Research：Patterns of Trustworthy Experimentation](https://www.microsoft.com/en-us/research/articles/patterns-of-trustworthy-experimentation-during-experiment-stage/) |
| `recommendation-click-bias`     | [Unbiased Learning-to-Rank with Biased Feedback](https://arxiv.org/abs/1608.04468)                                                                                                |
| `recommendation-dlrm-features`  | [Deep Learning Recommendation Model](https://arxiv.org/abs/1906.00091)                                                                                                            |
| `cv-vit-patches`                | [An Image is Worth 16x16 Words](https://arxiv.org/abs/2010.11929)                                                                                                                 |
| `cv-residual-connection`        | [Deep Residual Learning](https://arxiv.org/abs/1512.03385)                                                                                                                        |
| `speech-wer-evaluation`         | [Hugging Face Evaluate：WER metric card](https://huggingface.co/spaces/evaluate-metric/wer/blob/main/README.md)                                                                   |
| `video-temporal-consistency`    | [Video Diffusion Models](https://arxiv.org/abs/2204.03458)                                                                                                                        |

本题库不复制论文段落，不提供真实公司的保密题目。后续增加题目时维持“来源可查、答案简洁、条件明确、能够追问”的标准。
