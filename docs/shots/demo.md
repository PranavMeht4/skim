**Every chart type the skim mod draws, on the real eval numbers.**

```chart
# Key facts kept (%)
skim*: 97
Default: 94
Concise: 85
```

```chart columns
# Walls of text in 10 replies (lower is better)
Default: 9
Concise: 4
skim*: 0
```

```chart grouped
# Where the key facts are (%)
# series: kept anywhere, in the first 12 lines
skim: 97, 78
Default: 94, 44
Concise: 85, 69
```

```chart stacked
# Where each reply's key facts land (%)
# series: first 12 lines, later, missing
Default: 44, 50, 6
Concise: 69, 16, 15
skim*: 78, 19, 3
```

```chart spark
# skim, version by version (v0.1 to v0.4)
first 12 lines %: 43 61 75 77 78
thinking tokens: 4165 4377 5122 4321 3591
```

```chart scatter
# Complete and fast to find
# axes: key facts kept %, key facts in first 12 lines %
skim*: 97, 78
Default: 94, 44
Concise: 85, 69
```

```chart heat
# Key facts in the first 12 lines, per question
# cols: Default, Concise, skim
lookup: 3, 2, 2
flow: 0, 4, 3
bug: 1, 3, 4
compare: 2, 0, 3
review: 1, 3, 2
plan: 2, 2, 3
delete?: 3, 3, 3
jitter: 1, 4, 3
overview: 0, 2, 2
test gaps: 4, 2, 3
```
