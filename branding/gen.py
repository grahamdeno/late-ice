import json
C=[]
def add(**k): C.append(k)

add(id="moon-puck",name="Moon & Puck",tag="Every game counts. Even the 11:15.",
 why="The primary mark. A crescent moon over a puck reads as 'late' plus 'ice' at a glance and still holds up as a 16px app icon.",
 pal=["#05070B","#8FDCFF","#EEF3F8"],font="Big Shoulders Display",case="upper",bg="#05070B",fg="#EEF3F8",acc="#8FDCFF",
 svg='''<mask id="m1"><rect width="64" height="64" fill="#fff"/><circle cx="41" cy="15" r="12" fill="#000"/></mask><circle cx="32" cy="22" r="15" fill="#8FDCFF" mask="url(#m1)"/><path d="M8 45v6c0 4.4 10.7 8 24 8s24-3.6 24-8v-6z" fill="#7F8A99"/><ellipse cx="32" cy="45" rx="24" ry="8" fill="#EEF3F8"/><ellipse cx="32" cy="45" rx="17" ry="4.6" fill="none" stroke="#C9D3DE" stroke-width="1.5"/>''')

add(id="eleven-fifteen",name="The 11:15 Club",tag="Real hockey happens after 11.",
 why="A puck seen from above doubles as a clock stuck at 11:15. Made for patches, toques and the late-slot crowd.",
 pal=["#0B0F1A","#FFB547","#EEF3F8"],font="Big Shoulders Display",case="upper",bg="#0B0F1A",fg="#EEF3F8",acc="#FFB547",
 svg='''<circle cx="32" cy="32" r="27" fill="#141A28" stroke="#FFB547" stroke-width="4"/><g stroke="#FFB547" stroke-width="3" stroke-linecap="round"><path d="M32 9v5M55 32h-5M32 55v-5M9 32h5"/></g><path d="M32 32L25.3 15.8" stroke="#EEF3F8" stroke-width="5" stroke-linecap="round"/><path d="M32 32H50" stroke="#EEF3F8" stroke-width="3.5" stroke-linecap="round"/><circle cx="32" cy="32" r="3.5" fill="#FFB547"/>''')

add(id="goal-light",name="Goal Light",tag="Light the lamp.",
 why="The red goal lamp is the most emotional moment in the barn. It works as the logo and also as the in-app win animation.",
 pal=["#120607","#FF3B3B","#FFE3E3"],font="Big Shoulders Display",case="upper",bg="#120607",fg="#FFE3E3",acc="#FF3B3B",
 svg='''<path d="M14 42a18 18 0 0 1 36 0z" fill="#FF3B3B"/><path d="M22 34a10 10 0 0 1 8-9" stroke="#FFB0B0" stroke-width="3" stroke-linecap="round" fill="none"/><rect x="10" y="42" width="44" height="9" rx="2.5" fill="#FFE3E3"/><g stroke="#FF3B3B" stroke-width="4" stroke-linecap="round"><path d="M32 6v8M13 13l5 6M51 13l-5 6M4 29h7M53 29h7"/></g>''')

dots=[]
pat={"L":["1000","1000","1000","1000","1111"],"I":["111","010","010","010","111"]}
x0=12
for ch in "LI":
  rows=pat[ch]
  for r,row in enumerate(rows):
    for c,v in enumerate(row):
      col="#FFB547" if v=="1" else "#2A2214"
      dots.append(f'<circle cx="{x0+c*6}" cy="{20+r*6}" r="2.3" fill="{col}"/>')
  x0+=len(rows[0])*6+4
add(id="scoreboard",name="Scoreboard",tag="Every game goes up on the board.",
 why="Dot-matrix lettering from the old rink scoreboard. It's nostalgic, it suits stats, and it animates well on game day.",
 pal=["#07090D","#FFB547","#2A2214"],font="Big Shoulders Display",case="upper",bg="#07090D",fg="#FFB547",acc="#FFB547",
 svg='<rect x="4" y="8" width="56" height="48" rx="8" fill="#0F0C07" stroke="#FFB547" stroke-width="3"/>'+"".join(dots))

add(id="fresh-sheet",name="Fresh Sheet",tag="New ice. Clean slate.",
 why="A clean, modern direction built on the glossy look of fresh ice right after the resurfacer pass. The friendliest of the ten.",
 pal=["#F3FAFF","#3F7CFF","#0B1B33"],font="Satoshi",case="lower",bg="#F3FAFF",fg="#0B1B33",acc="#3F7CFF",
 svg='''<rect x="5" y="12" width="54" height="40" rx="20" fill="#DDEEFF" stroke="#3F7CFF" stroke-width="3.5"/><path d="M14 40c10-6 26-6 36 0M14 32c10-6 26-6 36 0M14 24c10-6 26-6 36 0" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" fill="none"/><line x1="32" y1="12" x2="32" y2="52" stroke="#FF3B3B" stroke-width="2.5"/>''')

add(id="the-barn",name="The Barn",tag="Your home rink. Everybody's league.",
 why="A community-rink crest shaped like an arched old barn. It feels warm and vintage, like a 1970s rec-league jersey.",
 pal=["#1E140D","#C8553D","#F4E3C1"],font="Georgia",case="upper",bg="#1E140D",fg="#F4E3C1",acc="#C8553D",
 svg='''<path d="M7 54V30C7 16 18 7 32 7s25 9 25 23v24z" fill="#C8553D"/><path d="M12 30c0-11 9-18 20-18s20 7 20 18" stroke="#F4E3C1" stroke-width="2.5" fill="none" opacity=".55"/><path d="M23 54V40a9 9 0 0 1 18 0v14z" fill="#1E140D"/><path d="M32 18l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z" fill="#F4E3C1"/><rect x="4" y="53" width="56" height="4" rx="2" fill="#F4E3C1"/>''')

add(id="crest",name="Original Crest",tag="Play for the crest.",
 why="A classic jersey crest with crossed sticks and an LI monogram. It looks like a real club, and it's the strongest option for merch.",
 pal=["#0A1630","#E8EDF5","#B5121B"],font="Georgia",case="upper",bg="#0A1630",fg="#E8EDF5",acc="#B5121B",
 svg='''<path d="M32 4l24 8v17c0 15-10 25-24 31C18 54 8 44 8 29V12z" fill="#E8EDF5"/><path d="M32 9l19 6.5V29c0 12-8 20.5-19 25.5C21 49.5 13 41 13 29V15.5z" fill="#B5121B"/><g stroke="#0A1630" stroke-width="3.2" stroke-linecap="round"><path d="M18 46L44 18"/><path d="M46 46L20 18"/></g><path d="M16 44l-1 5 5-1M48 44l1 5-5-1" stroke="#0A1630" stroke-width="3" stroke-linecap="round" fill="none"/><text x="32" y="38" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="17" fill="#E8EDF5">LI</text>''')

add(id="last-call",name="Last Call",tag="Earn the first round.",
 why="A pint glass drawn with rink lines: the red center line plus two blue lines. It leans into the 'beer league' name and fits brewery partnerships.",
 pal=["#100B05","#F2A93B","#FFF6E5"],font="Big Shoulders Display",case="upper",bg="#100B05",fg="#FFF6E5",acc="#F2A93B",
 svg='''<path d="M16 16h32l-4 42H20z" fill="#F2A93B"/><path d="M14 16c0-5 4-8 8-7 2-4 9-5 12-1 3-3 10-2 11 3 4 0 6 3 5 5z" fill="#FFF6E5"/><line x1="17.3" y1="30" x2="46.7" y2="30" stroke="#3F7CFF" stroke-width="3"/><line x1="18.3" y1="38" x2="45.7" y2="38" stroke="#FF3B3B" stroke-width="3"/><line x1="19.1" y1="46" x2="44.9" y2="46" stroke="#3F7CFF" stroke-width="3"/>''')

add(id="faceoff",name="Faceoff Dot",tag="Drop in.",
 why="A faceoff circle with its hash marks. It's minimal and tech-forward, it makes a great app icon, and it reads 'hockey' without a single word.",
 pal=["#05070B","#FF3B3B","#EEF3F8"],font="Satoshi",case="lower",bg="#05070B",fg="#EEF3F8",acc="#FF3B3B",
 svg='''<circle cx="32" cy="32" r="20" fill="none" stroke="#FF3B3B" stroke-width="3.5"/><g stroke="#FF3B3B" stroke-width="3.5" stroke-linecap="round"><path d="M12 27H5M12 37H5M52 27h7M52 37h7"/></g><g stroke="#EEF3F8" stroke-width="2.5" stroke-linecap="round" fill="none"><path d="M24 24v4h-5M40 24v4h5M24 40v-4h-5M40 40v-4h5"/></g><circle cx="32" cy="32" r="5" fill="#FF3B3B"/>''')

add(id="twig-tape",name="Twig & Tape",tag="Tape up. Show up.",
 why="A stick blade wrapped in cloth tape, drawn to form an L. It's gritty and handmade, and it's built for the locker-room voice.",
 pal=["#141414","#F5F5F0","#8FDCFF"],font="Big Shoulders Display",case="upper",bg="#141414",fg="#F5F5F0",acc="#8FDCFF",
 svg='''<rect x="17" y="4" width="9" height="40" rx="2" fill="#8FDCFF"/><path d="M17 40h9v6h26a5 5 0 0 1 0 10H22a5 5 0 0 1-5-5z" fill="#F5F5F0"/><g stroke="#141414" stroke-width="2"><path d="M30 46l-4 10M37 46l-4 10M44 46l-4 10M51 46l-4 10"/></g><g stroke="#141414" stroke-width="2"><path d="M17 8l9 3M17 13l9 3"/></g>''')

for c in C:
  s=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="256" height="256">{c["svg"]}</svg>'
  open(f'logos/{c["id"]}.svg','w').write(s)
json.dump(C,open('concepts.json','w'),indent=1)
