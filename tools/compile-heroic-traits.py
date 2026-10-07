"""Reviewed finishing catalog. Names and mechanics retain source wording."""
import re


def compile_traits(pack, pages, source, record, skill):
    def raw(title):
        return pages[title]['revisions'][0]['slots']['main']['content']

    def plain(text):
        text = re.sub(r'\[\[([^\]|]+)\|([^\]]+)\]\]', r'\2', text)
        text = re.sub(r'\[\[([^\]]+)\]\]', r'\1', text)
        return text.replace("'''", '').replace("''", '').strip()

    def reference(title, heading, text):
        return dict(heading=heading, text=plain(text), sourceId=source(title))

    pack['heroicTraits'] = dict(sourceIds=[source(title) for title in ['Heroic Traits', 'Destiny', 'Backgrounds', 'Languages']],
        eras=['Old Republic Era', 'Clone Wars', 'Dark Times', 'Rebellion Era', 'Legacy Era'],
        heroTypes=['Fringe Heroes', 'Military Heroes', 'Intrigue Heroes', 'Exploration Heroes'])
    pack['destinies'] = []
    index = raw('Destiny').split('===Sample Destinies===')[1].split('==Death and Destiny==')[0]
    for row in index.split('|-')[1:]:
        cells = [line[1:] for line in row.splitlines() if line.startswith('|') and not line.startswith('|}')]
        if len(cells) != 3:
            continue
        name = plain(cells[0])
        refs = [reference('Destiny', 'Destiny', cells[2])]
        for heading, text in re.findall(r"^\*\s*'''(Destiny Bonus|Destiny Penalty|Destiny Fulfilled):'''\s*(.*)$", raw(name), re.M):
            refs.append(reference(name, heading, text))
        assert len(refs) == 4, name
        pack['destinies'].append(record('destiny', name, reference=refs))
    pack['destinies'].append(record('destiny', 'Secret Destiny', 'Destiny', reference=[]))
    ship_section = raw('Destiny').split("==We've Been Through a Lot Together==")[1].split('==Heirloom Items==')[0]
    ship_refs = [reference('Destiny', 'Destiny Points', line[2:]) for line in ship_section.splitlines() if line.startswith('* ')]
    pack['destinies'].append(record('destiny', "We've Been Through a Lot Together", 'Destiny', reference=ship_refs))

    pack['backgrounds'] = []
    index = raw('Backgrounds')
    home_species = {'Bothawui Origin': 'bothan', 'Dorin Origin': 'kel-dor', 'Duro Origin': 'duros',
        'Gamorr Origin': 'gamorrean', 'Naboo Origin': 'gungan', 'Iridonia Origin': 'zabrak', 'Kashyyyk Origin': 'wookiee', 'Rodia Origin': 'rodian', 'Ryloth Origin': 'twi-lek'}
    for tab, category in [('Events', 'event'), ('Occupations', 'occupation'), ('Planets of Origin', 'planet')]:
        section = index.split(f'<tab name="{tab}">')[1].split('</tab>')[0]
        for row in section.split('|-')[1:]:
            cells = [line[1:] for line in row.splitlines() if line.startswith('|') and not line.startswith('|}')]
            if len(cells) != 3:
                continue
            name = plain(cells[0])
            relevant = []
            for linked in re.findall(r'\[\[([^\]]+)\]\]', cells[1]):
                if linked == 'Knowledge':
                    relevant.extend(s['id'] for s in pack['skills'] if s['id'].startswith('skill:knowledge-'))
                else:
                    relevant.append(skill(linked))
            refs = []
            if category == 'event':
                enhancement = re.search(r"'''Enhancement:'''\s*(.*)", raw(name))
                assert enhancement, name
                refs.append(reference(name, 'Enhancement', enhancement[1]))
            elif category == 'occupation':
                text = next(p for p in section.split('\n\n') if p.startswith('When you select an Occupation'))
                refs.append(reference('Backgrounds', 'Occupation', text))
            else:
                text = next(p for p in section.split('\n\n') if p.startswith('When you select a Planet'))
                refs.append(reference('Backgrounds', 'Planet of Origin', text))
            entry = record('background', name, category=category, relevantSkills=relevant,
                skillChoices=2 if category == 'planet' else 1,
                bonusLanguages=plain(cells[2]).split(' or ') if category == 'planet' else [],
                untrainedBonus=2 if category == 'occupation' else 0,
                excludedSpecies=['species:' + home_species[name]] if name in home_species else [],
                reference=refs)
            if name == 'Exiled':
                entry['conditionalFocus'] = skill('Knowledge (Galactic Lore)')
            pack['backgrounds'].append(entry)
    assert len(pack['backgrounds']) == 46
    assert len(pack['destinies']) == 11
    for key in ['destinies', 'backgrounds']:
        pack[key].sort(key=lambda r: r['name'])
    pack['license']['attribution'] = 'Adapted from Star Wars Saga Edition wiki contributors. Numeric facts, original reminders, and attributed mechanics; no artwork.'
    pack['license']['changes'] += ' Added reviewed Destiny/Background fields and verbatim mechanics with wiki markup removed.'
