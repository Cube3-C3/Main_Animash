# Project Specifications (Markdown Export)

## Source: Решения для проекта.txt

```text
Ниже — **структурированная спецификация веб‑платформы**, написанная так, чтобы **её можно было дать Codex / ИИ‑разработчику для реализации**.  
Документ ориентирован на **DSL‑управление сценой**, где текстовый ввод — основной интерфейс (быстрее GUI).

Я сделаю её в формате **Software Specification + DSL Specification**.

---

# 1. Обзор проекта

## Название
**Dynamic Math Scene Platform (DMSP)**

## Тип
Web‑платформа для:

- решения математических задач
- динамической геометрии
- анимации преобразований выражений
- создания объяснений

## Основная идея

Пользователь управляет сценой через **универсальную строку DSL**, где можно создавать:

- геометрию
- математические выражения
- текст
- зависимости
- анимацию

Все элементы сцены — **объекты графа зависимостей**.

---

# 2. Цели системы

1. Решение задач **быстрее интерфейса**
2. Поддержка **динамической геометрии**
3. Поддержка **CAS‑выражений**
4. Поддержка **объяснений через текст**
5. Поддержка **анимации преобразований**

---

# 3. Архитектура системы

## Общая схема

``` id="rtu05e"
User Input
    ↓
Lexer
    ↓
Parser
    ↓
AST
    ↓
Semantic Resolver
    ↓
Scene Graph
    ↓
Constraint Solver
    ↓
Renderer
```

---

# 4. Основные компоненты

## 4.1 Scene Graph

Все объекты сцены хранятся в графе.

``` id="b4ocrc"
Scene
 ├─ Geometry
 ├─ Expressions
 ├─ Text
 ├─ Constraints
 └─ Animations
```

Каждый объект имеет:

``` id="3m3ak8"
id
type
properties
dependencies
```

---

# 5. Типы объектов

## 5.1 Geometry

``` id="gof466"
Point
Line
Circle
Angle
Segment
Polygon
```

---

## 5.2 Mathematical

``` id="5iva0p"
Number
Variable
Expression
Function
Equation
```

---

## 5.3 Text

``` id="2aeny6"
Text
Label
Formula
Explanation
```

---

## 5.4 Constraint

``` id="jz2nh2"
Distance
Angle
Collinear
Bind
Offset
```

---

## 5.5 Animation

``` id="lqgfew"
TransformAnimation
ExpressionAnimation
StepAnimation
```

---

# 6. DSL — основной язык платформы

Все операции выполняются через **input line**.

DSL является **декларативным**.

---

# 7. Общая структура команды

``` id="ktdyah"
object = expression
```

или

``` id="lvzcmw"
function(arguments)
```

---

# 8. Создание объектов

## 8.1 Point

``` id="97ed6z"
A(0,0)
```

создает

``` id="hqsyo4"
Point A
x=0
y=0
```

---

## 8.2 Line

``` id="lqleus"
l = line(A,B)
```

---

## 8.3 Circle

``` id="tcttlb"
c = circle(A,B)
```

или

``` id="8l3g7p"
c = circle(A,5)
```

---

## 8.4 Segment

``` id="d9msn0"
s = segment(A,B)
```

---

# 9. Constraints

## Distance constraint

``` id="9071wq"
lock(A,B)
```

или

``` id="q7wv13"
distance(A,B)=5
```

---

## Angle constraint

``` id="u1i8zy"
angle(A,B,C)=60
```

---

## Bind

Полное совпадение

``` id="k2jcov"
bind(A,B)
```

---

## Offset

расстояние до линии

``` id="rsz2b4"
offset(P,l,3)
```

---

# 10. Mathematical Expressions

## Variable

``` id="ckhisx"
x = 5
```

---

## Expression

``` id="f4feox"
y = 2*x + 3
```

---

## Geometry expression

``` id="ptizks"
d = distance(A,B)
```

---

# 11. Expressions inside geometry

``` id="t0l6sm"
A(0,0)
B(d,0)
```

B зависит от d.

---

# 12. Text objects

## Static

``` id="a9w4qd"
t = text("Triangle")
```

---

## Dynamic

``` id="u8a8ra"
t = text("AB=" + distance(A,B))
```

Text автоматически обновляется.

---

# 13. Formula objects

``` id="2ae5oz"
f = formula("x^2+2x+1")
```

или

``` id="3ydb0f"
f = expr("x^2+2x+1")
```

---

# 14. Explanation blocks

``` id="1bcrez"
explain = text("""
AB = 5
Triangle is isosceles
""")
```

---

# 15. Implicit object creation

Если объект используется, но не существует:

``` id="9jdcdu"
distance(A,B)
```

система создаёт:

``` id="1dxc79"
Point A
Point B
```

автоматически.

Это ускоряет ввод.

---

# 16. Dependency Graph

Каждый объект хранит зависимости.

Пример:

``` id="gukprj"
A
B
↓
distance(A,B)
↓
text
```

Изменение A пересчитывает всё.

---

# 17. Constraint Solver

Solver выполняется после изменения сцены.

Алгоритм:

``` id="013t9d"
1 detect changed objects
2 collect dependent constraints
3 sort by priority
4 solve constraints
```

---

# 18. Degrees of freedom

Точка имеет:

``` id="6zyye2"
2 DOF
```

Constraint уменьшает DOF.

Примеры:

``` id="2uj5fz"
distance(A,B) → B движется по окружности
distance(P,line) → P движется по параллели
angle(A,B,C) → вершина по окружности
```

---

# 19. Animation

## Expression transform

``` id="myiia2"
e = expr("(a+b)^2")

step1 = expand(e)

step2 = simplify(step1)

animate(e → step1 → step2)
```

---

## Geometry animation

``` id="xby7cx"
animate(A, circle(A,5))
```

---

# 20. Event System

Объекты могут иметь события.

``` id="ik6ins"
onUpdate
onClick
onDrag
```

Подобные системы используются в динамической геометрии, где действия выполняются при изменении объектов или их перемещении. ([geogebra.github.io](https://geogebra.github.io/docs/manual/en/Scripting/?utm_source=chatgpt.com))

---

# 21. Rendering Engine

Поддержка:

``` id="xhbwv5"
Canvas2D
WebGL
SVG
```

Объекты имеют визуальные свойства:

``` id="9occdq"
color
size
layer
visibility
```

---

# 22. UI компоненты

``` id="ex8ugs"
Scene canvas
Input DSL line
Object inspector
Timeline (animation)
History
```

---

# 23. Example Session

``` id="nkevac"
A(0,0)
B(5,0)
C(3,4)

l = line(A,B)

d = distance(A,B)

c = circle(A,d)

angle(A,B,C)=60

t = text("AB = " + d)
```

Результат:

``` id="5nyfsr"
3 точки
прямая
окружность
constraint
динамический текст
```

---

# 24. Data Model

Пример JSON объекта:

``` id="om7urk"
{
 "id":"A",
 "type":"Point",
 "x":0,
 "y":0,
 "dependencies":[]
}
```

---

# 25. Persistence

Формат проекта:

``` id="a5cvmt"
JSON Scene
+ DSL script
```

---

# 26. API

## Create object

``` id="ycs53q"
POST /scene/object
```

## Update

``` id="1uep1b"
PATCH /scene/object/{id}
```

## Evaluate DSL

``` id="0pobth"
POST /dsl/eval
```

---

# 27. Technology Stack

Frontend

``` id="3dv46q"
TypeScript
WebGL
Canvas
React / Svelte
```

Backend

``` id="3qeigq"
Node.js
Rust solver module
```

---

# 28. Performance requirements

Target:

``` id="zm2p1g"
<10 ms solver update
<16 ms frame render
```

---

# 29. Extensibility

DSL поддерживает плагины.

``` id="rha54f"
plugin
command
object
constraint
```

---

# 30. Будущие расширения

``` id="d4cmex"
3D geometry
symbolic algebra
AI proof assistant
automatic theorem proving
```

---

# 31. Основной принцип платформы

**Everything is an object**

``` id="ft91v3"
geometry
math
text
animation
```

Все они находятся в **одном графе зависимостей**.

---

✅ Эта спецификация уже пригодна для **генерации проекта через Codex**.

---

Если хочешь, я могу сделать ещё **2 очень важных документа**, которые резко увеличат шанс успешной реализации:

1️⃣ **Formal DSL grammar (EBNF)**  
2️⃣ **архитектуру constraint‑solver (как в CAD / GeoGebra)**  

Это как раз **самые сложные части платформы**.
```

