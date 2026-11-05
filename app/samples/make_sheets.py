import json, random
G=[
 dict(id="c-league-flyers-owls", league="C", date="11/01/2026", time="8:45 PM",
  home="Front Street Flyers", away="Ogden Owls",
  home_roster=[(1,"Mike Tolliver","G"),(4,"Dan Reyes",""),(7,"Chris Hales",""),(9,"Sam Okafor",""),(12,"Jake Brandt",""),(17,"Tom Kuehn",""),(19,"Ryan Pell",""),(22,"Nick Ferraro",""),(27,"Ben Ashby",""),(44,"Luke Marsh","")],
  away_roster=[(30,"Paul Grady","G"),(3,"Eric Lunde",""),(5,"Matt Cho",""),(8,"Kyle Brennan",""),(11,"Josh Weller",""),(14,"Drew Fisk",""),(16,"Alex Novak",""),(21,"Pete Simms",""),(88,"Tyler Voss","")],
  home_goals=[(1,"12:41",9,17,None),(2,"8:03",12,9,22),(3,"10:15",17,None,None),(3,"2:58",9,4,None)],
  away_goals=[(1,"4:20",11,8,None),(2,"13:07",88,11,5),(3,"6:44",14,16,None)],
  home_pen=[(2,22,"Tripping",2,"11:30","9:30")],
  away_pen=[(1,5,"Hooking",2,"9:12","7:12"),(3,3,"Slashing",2,"5:01","3:01")],
  home_shots=(9,11,12), away_shots=(8,10,9)),
 dict(id="40-plus-salts-dadbods", league="40+", date="11/02/2026", time="9:30 PM",
  home="Old Salts", away="Dad Bod Squad",
  home_roster=[(31,"Gary Pruitt","G"),(2,"Bill Hanlon",""),(6,"Steve Mraz",""),(10,"Rich Castellano",""),(15,"Don Whitley",""),(18,"Mark Iverson",""),(23,"Jeff Albrecht",""),(77,"Kevin Doyle","")],
  away_roster=[(35,"Phil Barone","G"),(4,"Greg Lutz",""),(7,"Tim Sorensen",""),(13,"Rob Delgado",""),(20,"Jim Kowalski",""),(24,"Scott Raines",""),(29,"Dave Pickett",""),(91,"Carl Benning","")],
  home_goals=[(1,"9:55",10,77,None),(3,"7:22",18,10,6)],
  away_goals=[(2,"11:48",20,13,None),(3,"1:36",29,None,None)],
  home_pen=[(2,15,"Interference",2,"6:10","4:10")],
  away_pen=[],
  home_shots=(7,6,10), away_shots=(9,8,7)),
]
def per(goals):
  s=[0,0,0]
  for g in goals: s[g[0]-1]+=1
  return s
def rows(items,n):
  return items+[None]*(n-len(items))
H='<span class="h">%s</span>'
def sheet(g):
  hp,ap=per(g["home_goals"]),per(g["away_goals"])
  def roster(r):
    return "".join(f'<tr><td>{H%x[0] if x else ""}</td><td class="nm">{H%x[1] if x else ""}</td><td>{H%x[2] if x and x[2] else ""}</td></tr>' for x in rows(r,14))
  def goals(gl):
    return "".join(f'<tr><td>{H%x[0] if x else ""}</td><td>{H%x[1] if x else ""}</td><td>{H%x[2] if x else ""}</td><td>{H%x[3] if x and x[3] else ""}</td><td>{H%x[4] if x and x[4] else ""}</td></tr>' for x in rows(gl,8))
  def pens(pl):
    return "".join(f'<tr><td>{H%x[0] if x else ""}</td><td>{H%x[1] if x else ""}</td><td class="off">{H%x[2] if x else ""}</td><td>{H%x[3] if x else ""}</td><td>{H%x[4] if x else ""}</td><td>{H%x[5] if x else ""}</td></tr>' for x in rows(pl,5))
  def team(side,name,r,gl,pl):
    return f'''<div class="team"><div class="tn"><b>{side}</b> {H%name}</div>
<div class="cols"><table class="ro"><tr><th>No.</th><th>Player</th><th>Pos</th></tr>{roster(r)}</table>
<div><table class="sc"><tr><th colspan=5>SCORING</th></tr><tr><th>Per</th><th>Time</th><th>G</th><th>A</th><th>A</th></tr>{goals(gl)}</table>
<table class="pe"><tr><th colspan=6>PENALTIES</th></tr><tr><th>Per</th><th>No.</th><th>Offense</th><th>Min</th><th>Off</th><th>On</th></tr>{pens(pl)}</table></div></div></div>'''
  rot=random.uniform(-1.2,1.2)
  return f'''<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Nanum+Pen+Script&family=Roboto+Condensed:wght@400;700&display=swap" rel="stylesheet"><style>
body{{margin:0;background:#c9c4b8;padding:40px;width:1300px}}
.p{{background:#fbfaf5;padding:28px 32px;font-family:'Roboto Condensed',sans-serif;color:#1d2a44;transform:rotate({rot:.2f}deg);box-shadow:0 10px 30px rgba(0,0,0,.35);background-image:linear-gradient(90deg,rgba(0,0,0,.02),transparent 30%,rgba(0,0,0,.03))}}
h1{{margin:0;font-size:30px;letter-spacing:.06em;text-align:center}} .s{{text-align:center;font-size:15px;margin-top:2px}}
.meta{{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0;font-size:15px}} .meta div{{border-bottom:1.5px solid #1d2a44;padding-bottom:2px}}
.h{{font-family:'Nanum Pen Script',cursive;color:#1739a8;font-size:27px;line-height:.8}}
.teams{{display:grid;grid-template-columns:1fr 1fr;gap:22px}}
.tn{{font-size:16px;border:1.5px solid #1d2a44;padding:6px 8px;margin-bottom:6px}}
.cols{{display:grid;grid-template-columns:1fr 1.25fr;gap:8px}}
table{{border-collapse:collapse;width:100%;font-size:13px;margin-bottom:8px}} th,td{{border:1px solid #1d2a44;height:27px;padding:0 4px;text-align:center}} th{{background:#e9e6dc;height:20px}}
td.nm{{text-align:left}} td.off{{text-align:left}}
.bot{{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:18px;margin-top:10px}}
.sig div{{border-bottom:1.5px solid #1d2a44;height:34px;margin-top:6px;font-size:13px}}
</style></head><body><div class="p">
<h1>OFFICIAL SCORESHEET</h1><div class="s">POLAR ICE WILMINGTON · ADULT HOCKEY LEAGUE</div>
<div class="meta"><div>Date {H%g["date"]}</div><div>Time {H%g["time"]}</div><div>League / Div. {H%g["league"]}</div><div>Rink {H%"Polar Ice"}</div></div>
<div class="teams">{team("HOME",g["home"],g["home_roster"],g["home_goals"],g["home_pen"])}{team("VISITOR",g["away"],g["away_roster"],g["away_goals"],g["away_pen"])}</div>
<div class="bot"><table><tr><th>Score</th><th>1</th><th>2</th><th>3</th><th>OT</th><th>Total</th></tr>
<tr><td>Home</td>{"".join(f"<td>{H%x}</td>" for x in hp)}<td></td><td>{H%sum(hp)}</td></tr>
<tr><td>Visitor</td>{"".join(f"<td>{H%x}</td>" for x in ap)}<td></td><td>{H%sum(ap)}</td></tr></table>
<table><tr><th>Shots</th><th>1</th><th>2</th><th>3</th></tr><tr><td>Home</td>{"".join(f"<td>{H%x}</td>" for x in g["home_shots"])}</tr><tr><td>Visitor</td>{"".join(f"<td>{H%x}</td>" for x in g["away_shots"])}</tr></table>
<div class="sig"><div>Referee {H%"B. Ruiz"}</div><div>Scorekeeper {H%"K. Lam"}</div></div></div>
</div></body></html>'''
random.seed(7)
for g in G:
  open(f'{g["id"]}.html','w').write(sheet(g))
json.dump(G,open('truth.json','w'),indent=1)
print("ok")
