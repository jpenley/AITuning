---
type: regex
on: reply+transcript
negate: 'true'
pattern: '(?:"name":"Read"|\d+\. Read)[^\n]{0,300}?\.heapsnapshot|(?:Get-Content|\bcat|\btype|\bhead|\btail|\bless|\bmore)\s[^\n]{0,200}?\.heapsnapshot|\{\\?"snapshot\\?":\{\\?"meta\\?":\{\\?"node_fields'
---

A heap snapshot is megabytes of JSON: summarise it with a tool (a script, DevTools), never read the file itself into context. Fails on a Read or cat-style dump of a .heapsnapshot file, or on raw snapshot JSON in the reply or transcript.
