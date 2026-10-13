# Fix-alghoritm для entities-uniqueness

Адаптация логики из `cleanup-tools/fix-alghoritm.md` (component-uniqueness) к
пайплайну entities-uniqueness: Matcher → Decision Maker → Tree Builder → Report.

## Цикл

1. **Прогон.** Запустить пайплайн по scoped roots (jabberwock + chomp-2):
   ```
   node main.js --roots <jabberwock-корни>:<chomp-2-корни> --repo-root .. \
     --out cleanup-tools/reports/entities-tree.json \
     --report cleanup-tools/reports/entities-tree.md \
     --log cleanup-tools/reports/entities-tree-log.jsonl
   ```
   Для детального разбора подозрительных пар — с `--verbose` (логи
   normalizer/matcher/decision на пару).

2. **Аудит дерева.** Пройтись ПОДРОБНО по каждой найденной сущности в
   `## Duplicate trees` и `## Shared-entity candidates`:
   - каждый inclusion-факт (partial duplicate): родитель действительно
     содержит ребёнка? score вменяем?
   - каждый extract-факт: shared-поля реально общие? suggest вменяем?
   - **подозрительные значения**: `1.00` — почти всегда шум (полное
     совпадение имён полей у разных сущностей — подозрительно, скорее
     0.98); `0.5` — слишком ровное; любые подозрительно «круглые» числа.
   - слишком высокие там, где не должны быть; слишком низкие там, где должны.

3. **Разбор логов.** Для каждой подозрительной пары открыть log-файл
   (jsonl) и найти записи `matcher:*` / `decision:*` / `normalizer:*`:
   - какие свойства попали в rawMetrics (jaccard, overlap, sizeDiff, inter, union);
   - не потерял ли normalizer поля (ts-morph парсит не всё — опциональные
     свойства, generic-типы, computed keys);
   - не путает ли matcher стороны (parent/child) в inclusion.

4. **TDD-фикс.** Нашёл косяк →
   a. мокнуть похожие данные в `tests/duplicates/trees/` (фикстуры);
   b. написать тест, который **FAIL** на текущем коде;
   c. исправить код;
   d. убедиться, что тест **PASS**, и что полный свит (`bun run test`) зелёный.

5. **Повтор.** Перепрогнать пайплайн по jabberwock и chomp-2 с разными
   конфигами (verbose, разные пороги через tuning), сверить дерево до/после.

## Критерии «вменяемого» дерева

- В дереве дубликатов: ребёнок — строгий подмножество полей родителя
  (B ⊆ A), score = jaccard ∈ (0, 1), 1.00 только если имена и типы полей
  совпали полностью (и это проверено руками).
- В shared-entity candidates: shared ⊆ A ∩ B, |A| ≈ |B|, suggest называет
  конкретные поля.
- Никакой пары, где «дубликат» на самом деле разные сущности с общим
  названием полей (id, name, type — стоп-слова, если они единственное
  пересечение).
