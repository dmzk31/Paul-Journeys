"""Import the user-approved manuscript without generating spiritual commentary."""
import hashlib
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
raw = (root / 'assets/data/study-reference.md').read_text(encoding='utf-8')
catalog = {}
def life(n):
    key = f'life-{n}'
    catalog[key] = {'book':'使徒行傳生命讀經', 'message':n,
                    'label':f'生命讀經 第{n}篇',
                    'url':f'https://line.twgbr.org/life-study/44_{n}.html'}
    return key
for n in [36,37,38,39,40,43,44,45,46,47,48,50,52,53,54,56,70,71,72]: life(n)
for n, page, title in [(9,158,'保守自己在主工作的一道流中，為著召會的擴展，並且受主憐憫蒙拯救脫離撒但的詭計'),
                       (12,199,'使徒行傳的繼續─基督團體的繼續')]:
    catalog[f'crystal-{n}'] = {'book':'使徒行傳結晶讀經','message':n,'title':title,
        'label':f'結晶讀經 第{n}篇', 'url':f'https://www.rucoc.com/Selbooks/Crystal/Acts/Acts.pdf#page={page}'}

# The associations below link a manuscript event to existing, sourced map nodes.
bindings = {
 1:[[0],[],[1],[2],[3],[4],[5],[6],[7],[8],[8],[8],[],[],[9]],
 2:[[0],[2],[2],[5],[],[],[6],[],[],[7],[8],[9],[10],[11],[11],[12],[12],[12]],
 3:[[0],[1],[1],[2,3,4,5,6],[7],[7],[7],[8],[],[],[9],[],[],[],[10],[],[11],[12]],
 4:[[0],[1],[2],[],[],[3],[4,5,6],[7,8],[],[],[9],[10],[10],[11,12,13]]}
event_sources = {
 1:[[36],[36],[36],[36,37],[37,38],[39],[39],[40],[40],[40]],
 2:[[43],[43],[43],[44],[44],[44,45],[45],[46],[46],[46,47],[48],[48],[48]],
 3:[[50],[50],[50],[50],[50],[52],[52],[52],[52],[53,54],[56],[56],[56]],
 4:[[70],[70],[70],[70],[70],[70],[70],[70,71],[71],[71],[71],[71],[71],[71]]}
point_sources = {
 1:[[life(36)],['crystal-9'],[life(40)],[life(40)]],
 2:[[life(43)],[life(44),life(45)],[life(45),life(48)],[life(46),life(47)],[life(48)]],
 3:[[life(50)],[life(50),life(52)],[life(52)],[life(53),life(54)],[life(56),'crystal-9']],
 4:[[life(70)],[life(70)],[life(71)],['crystal-12',life(72)],[life(71),'crystal-12']]}
event_points = {
 1:[[0],[0],[1],[],[1],[1],[1],[1],[2],[3]],
 2:[[0],[0],[0],[1],[1],[1],[2],[3],[3],[3],[2],[4],[4]],
 3:[[0],[0],[0],[0,1],[1],[2],[1],[2],[2],[3],[4],[4],[4]],
 4:[[0],[0],[0],[0],[0],[1],[1],[2,3],[2,3],[4],[4],[4],[4],[4]]}

# Short, verified source phrases supplement events without a manuscript exposition.
excerpts = {
 (1,0):('按手是指聯合','life-36'),
 (1,2):('結果那地方就興起了見證。','life-36'),
 (1,3):('在帶人同行的事上應當謹慎','life-36'),
 (1,4):('保羅的講說乃是以基督為中心。','life-38'),
 (1,8):('堅固他們的心思、情感和意志','life-40'),
 (2,3):('禁止也是聖靈引導的一部分。','life-44'),
 (2,4):('耶穌的靈不許','life-44'),
 (2,5):('將祂的國開展到另一大陸，就是歐洲。','life-45'),
 (2,6):('神救恩的完整單位','life-45'),
 (2,7):('供應包羅萬有的基督','life-46'),
 (2,8):('我們甚麼時候頑固，就無法開明。','life-46'),
 (2,9):('我們可以從創造開始，但不該停留在那裡。','life-47'),
 (2,10):('來維持自己的生活','life-48'),
 (2,12):('盡力保守基督身體的一','life-48'),
 (3,3):('來為主建立剛強的見證','life-50'),
 (3,4):('清除他們已往罪惡和鬼魔的生活','life-50'),
 (3,6):('為著神國的爭戰','life-52'),
 (3,8):('保羅實在對主的身體有負擔。','life-52'),
 (3,9):('主要的責任不是轄管，乃是牧養','life-53'),
 (3,10):('接受並順從','life-56'),
 (4,4):('保羅的生活乃是活基督、顯大基督的生活。','life-70'),
 (4,7):('將真神彰顯出來','life-71'),
 (4,8):('醫治者和喜樂','life-71'),
 (4,13):('基督作生命擴展到信徒裡面','life-71')}

sections = re.findall(r'^# [貳參肆伍]、(.+?)\n(.*?)(?=^# [參肆伍陸]、)',raw,re.M|re.S)
assert len(sections)==4
journeys=[]
for number,(title,body) in enumerate(sections,1):
    route=re.search(r'### 一、行程路線\s*\n(.+)',body).group(1).strip().rstrip('。')
    event_section=re.search(r'### [二三]、主要事件\s*\n(.*?)(?=\n### )',body,re.S).group(1)
    events=[]
    for line in event_section.splitlines():
        if not line.startswith('|'): continue
        cells=[v.strip() for v in line.strip('|').split('|')]
        if cells[0]=='地點' or set(cells[0])<=set('-:'):continue
        index=len(events)
        event={'id':f'{number}-event-{index+1}','place':cells[0],'text':cells[1],
            'ref':'徒'+cells[2], 'sources':[f'life-{n}' for n in event_sources[number][index]],
            'points':event_points[number][index], 'stops':[i for i,ids in enumerate(bindings[number]) if index in ids]}
        if (number,index) in excerpts:
            quote,source=excerpts[(number,index)];event['excerpt']={'text':quote,'source':source}
        events.append(event)
    content=re.split(r'### [三四]、這次行程的主要內容\s*',body)[1]
    points=[]
    for heading,paragraph in re.findall(r'\*\*\d+\. (.+?)\*\*\s*\n(.*?)(?=\n\*\*\d+\.|\Z)',content,re.S):
        original=paragraph.strip().removesuffix('---').strip()
        # Only remove link markup and broken paste-tail artifacts; retain prose verbatim.
        clean=re.sub(r'\[生命讀經\]\([^)]+\)','',original)
        clean=clean.replace('第十二篇　使徒行传的继续─基督团体的继续','').strip()
        paragraphs=[p.strip() for p in re.split(r'\n\s*\n',clean) if p.strip()]
        points.append({'title':heading,'paragraphs':paragraphs,'sources':point_sources[number][len(points)],
                       'kind':'provided-compilation','originalParagraph':original})
    background_match=re.search(r'### 二、行程背景\s*\n(.*?)(?=\n### )',body,re.S)
    background=[]
    if background_match:
        text=background_match.group(1).strip()
        text=re.sub(r'第九篇　保守自己在主工作的一道流中，为着召会的扩展，并且受主怜…','',text)
        background=[p.strip() for p in text.split('\n\n') if p.strip()]
    journeys.append({'id':number,'title':title,'route':route,'events':events,'points':points,
                     'stopEvents':bindings[number],'background':background})

summary_rows=re.search(r'## 柒、.*?(\| 行程 \| 資料中的著重 \|.*?)(?=\n\n\*\*以上)',raw,re.S).group(1)
summaries=[]
for line in summary_rows.splitlines():
    if line.startswith('| **'):
        summaries.append(line.strip('|').split('|')[1].strip())
assert len(summaries)==4
for journey,summary in zip(journeys,summaries):journey['summary']=summary

result={'version':1,'title':'保羅四次出外盡職的行程整理','manuscript':'study-reference.md',
    'manuscriptSha256':hashlib.sha256(raw.encode()).hexdigest(),
    'sourceNote':'以提供的四次行程整理為主要底稿；資料整理與原文短摘分別標示。',
    'sources':catalog,'journeys':journeys}
(root/'assets/data/study-guide.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Imported',len(journeys),'journeys,',sum(len(j['events']) for j in journeys),'events and',sum(len(j['points']) for j in journeys),'content sections')
