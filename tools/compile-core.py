#!/usr/bin/env python3
"""Explicitly reviewed mechanical mappings; raw snapshots are required provenance."""
import json
import importlib.util
import re
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
pages, aliases, sources = {}, {}, {}
reviewed = json.loads((ROOT / 'tools/reviewed-revisions.json').read_text())
for path in sorted((ROOT / '.build').glob('*-snapshot.json')):
    data = json.loads(path.read_text())
    for p in data.get('query', {}).get('pages', []):
        if p.get('revisions'):
            pages[p['title']] = p
    for r in data.get('query', {}).get('redirects', []):
        aliases[r['from']] = r


def slug(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def source(title):
    alias = aliases.get(title, {})
    canonical = alias.get('to', title)
    p = pages[canonical]
    rev = p['revisions'][0]
    if reviewed.get(canonical) != rev['revid']:
        raise RuntimeError(f'Review required: {canonical} revision {rev["revid"]}; update the reviewed mapping and manifest deliberately.')
    sid = 'source:' + slug(title)
    fragment = '#' + quote(alias['tofragment'].replace(' ', '_')) if alias.get('tofragment') else ''
    sources[sid] = dict(id=sid, title=canonical, section=alias.get('tofragment'),
        revision=rev['revid'], timestamp=rev['timestamp'],
        url=f"https://swse.miraheze.org/w/index.php?oldid={rev['revid']}" + fragment,
        history='https://swse.miraheze.org/w/index.php?title=' + quote(canonical) + '&action=history')
    return sid


def record(record_type, name, title=None, **fields):
    return dict(id=record_type + ':' + slug(name), name=name, sourceId=source(title or name), **fields)


def skill(name):
    return 'skill:' + slug(name)


def feat(name):
    return 'feat:' + slug(name)


def req(kind, value, **more):
    return dict(kind=kind, value=value, **more)


def effect(target, amount, **more):
    return dict(target=target, amount=amount, type='competence' if target=='skillFocus' else 'untyped', **more)


pack = dict(schemaVersion=1, id='swse-core', version='0.1.0', name='Saga Edition starter catalog',
    license=dict(name='CC BY-SA 4.0 (wiki adaptations)', url='https://creativecommons.org/licenses/by-sa/4.0/',
                 attribution='Adapted from Star Wars Saga Edition wiki contributors. Numeric facts and original summaries; no artwork.',
                 changes='Reviewed JSON adaptation and concise original trait reminders.'),
    sources=[], species=[], classes=[], skills=[], feats=[], talents=[], equipment=[],
    rules=dict(pointBuyBudget=25, pointBuyCosts={8:0,9:1,10:2,11:3,12:4,13:5,14:6,15:8,16:10,17:13,18:16},
        standardArray=[15,14,13,12,10,8], generalFeatLevels=[1,3,6,9,12,15,18],
        abilityLevels=[4,8,12,16,20], trainingBonus=5, focusBonus=5,
        conditionPenalties=[0,-1,-2,-5,-10,-10],
        weaponSizeOrder=['fine','diminutive','tiny','small','medium','large','huge','gargantuan','colossal'],
        armorPenalties={'light':-2,'medium':-5,'heavy':-10},
        sizeReflex={'small':1,'medium':0,'large':-1}, sizeThreshold={'small':0,'medium':0,'large':5},
        sourceIds=[source(x) for x in ['Character Creation','Abilities','Level Benefits','Defenses','Heroic Classes','Skills','Conditions','Category:Weapons','Attacks']]))

species = [
 ('Human',{}, {}, ['Basic'], [], None),
 ('Bothan',{'dex':2,'con':-2},{'will':2},['Basic','Bothese'],[], 'Gather Information'),
 ('Duros',{'dex':2,'int':2,'con':-2},{},['Basic','Durese'],['Pilot rerolls must use the new result.'],None),
 ('Kel Dor',{'dex':2,'wis':2,'con':-2},{},['Basic','Kel Dor'],['Low-light vision. Protective goggles and antiox breath mask are supplied at creation.','Keep the better reroll for Search Your Feelings or Sense Force.'],None),
 ('Rodian',{'dex':2,'wis':-2,'cha':-2},{},['Basic','Rodese'],['Low-light vision. Perception rerolls must use the new result.'], 'Survival'),
 ("Twi'lek",{'cha':2,'wis':-2},{'fortitude':2},['Basic','Ryl'],['Low-light vision. Deception rerolls must use the new result.'],None),
 ('Wookiee',{'str':4,'con':2,'dex':-2,'wis':-2,'cha':-2},{},['Shyriiwook','Basic (understood)'],['Take 10 on Climb under pressure. Recover HP at twice the usual rate.','Rage once per day: +2 melee attack and damage for 5 + CON modifier rounds, then a persistent condition step.','Intimidation rerolls must use the new result. Bowcaster counts as rifles; Ryyk blade as advanced melee.','Other languages can be understood, read and written, but not spoken.'],None),
 ('Zabrak',{}, {'reflex':1,'fortitude':1,'will':1},['Basic','Zabrak'],['Perception rerolls must use the new result.'],None)
]
for name, scores, defenses, languages, reminders, focus in species:
    pack['species'].append(record('species',name,abilityAdjustments=scores,defenses=defenses,
        size='medium',speed=6,languages=languages,bonusFeats=int(name=='Human'),bonusSkills=int(name=='Human'),
        conditionalFocus=skill(focus) if focus else None,reminders=reminders))

knowledge = ['Bureaucracy','Galactic Lore','Life Sciences','Physical Sciences','Social Sciences','Tactics','Technology']
base_skills = {'Acrobatics':'dex','Climb':'str','Deception':'cha','Endurance':'con','Gather Information':'cha','Initiative':'dex','Jump':'str','Mechanics':'int','Perception':'wis','Persuasion':'cha','Pilot':'dex','Ride':'dex','Stealth':'dex','Survival':'wis','Swim':'str','Treat Injury':'wis','Use Computer':'int','Use the Force':'cha'}
armor_skills = ['Acrobatics','Climb','Endurance','Initiative','Jump','Stealth','Swim']
for name, ability in {**base_skills, **{'Knowledge ('+k+')':'int' for k in knowledge}}.items():
    pack['skills'].append(record('skill',name,'Knowledge' if name.startswith('Knowledge') else name if name in ['Mechanics','Treat Injury','Use the Force'] else 'Skills',ability=ability,
        trainedOnly=name=='Mechanics', armorCheck=name in armor_skills,
        reminder='Untrained checks are limited to common knowledge (DC 10).' if name.startswith('Knowledge') else
            'Some applications require training.' if name in ['Use the Force','Treat Injury','Use Computer','Acrobatics','Survival'] else ''))

class_rows = [
 ('Jedi',10,2,1,{'reflex':1,'fortitude':1,'will':1},['Acrobatics','Endurance','Initiative','Jump','Mechanics','Perception','Pilot'],['Force Sensitivity','Weapon Proficiency (Lightsabers)','Weapon Proficiency (Simple Weapons)'],100,['Jedi Consular','Lightsaber Combat']),
 ('Noble',6,6,.75,{'reflex':1,'will':2},['Deception','Gather Information','Initiative','Perception','Persuasion','Pilot','Ride','Treat Injury','Use Computer'],['Linguist','Weapon Proficiency (Pistols)','Weapon Proficiency (Simple Weapons)'],400,['Inspiration','Leadership','Lineage']),
 ('Scoundrel',6,4,.75,{'reflex':2,'will':1},['Acrobatics','Deception','Gather Information','Initiative','Mechanics','Perception','Persuasion','Pilot','Stealth','Use Computer'],['Point-Blank Shot','Weapon Proficiency (Pistols)','Weapon Proficiency (Simple Weapons)'],250,['Fortune','Misfortune']),
 ('Scout',8,5,.75,{'reflex':2,'fortitude':1},['Climb','Endurance','Initiative','Jump','Mechanics','Perception','Pilot','Ride','Stealth','Survival','Swim'],['Shake It Off','Weapon Proficiency (Pistols)','Weapon Proficiency (Rifles)','Weapon Proficiency (Simple Weapons)'],250,['Awareness','Survivor']),
 ('Soldier',10,3,1,{'reflex':1,'fortitude':2},['Climb','Endurance','Initiative','Jump','Mechanics','Perception','Pilot','Swim','Treat Injury','Use Computer'],['Armor Proficiency (Light)','Armor Proficiency (Medium)','Weapon Proficiency (Pistols)','Weapon Proficiency (Rifles)','Weapon Proficiency (Simple Weapons)'],250,['Armor Specialist','Weapon Specialist'])
]
for name,hd,count,bab,defs,names,starting,mult,trees in class_rows:
    names += ['Knowledge ('+k+')' for k in knowledge if name!='Soldier' or k=='Tactics']
    pack['classes'].append(record('class',name,hitDie=hd,startingHP=hd*3,trainedSkills=count,
        bab=[int(i*bab) for i in range(1,21)], defenses=defs, skills=list(map(skill,names)),
        startingFeats=list(map(feat,starting)), bonusFeats=[], talentTrees=['tree:'+slug(t) for t in trees],
        credits={'dice':3,'sides':4,'multiplier':mult}))

feat_rows = [
 ('Improved Defenses', [], [effect('defenses',1)], 'All three defenses increase by 1.'),
 ('Toughness', [], [effect('hp',1,perLevel=True)], 'Gain 1 HP per heroic level.'),
 ('Improved Damage Threshold', [], [effect('threshold',5)], 'Damage threshold increases by 5.'),
 ('Force Sensitivity', [], [], 'Use the Force becomes available and a class skill. Force talent trees become available when imported.'),
 ('Linguist',[req('ability','int',min=13)],[], 'Learn 1 + INT modifier additional languages, minimum 1, per selection.'),
 ('Shake It Off',[req('ability','con',min=13),req('trained',skill('Endurance'))],[], 'Recover one condition step with two swift actions.'),
 ('Point-Blank Shot',[],[], '+1 ranged attack and damage within point-blank range; apply with attack modifiers.'),
 ('Precise Shot',[req('feat',feat('Point-Blank Shot'))],[], 'Remove the ranged attack penalty for firing into melee.'),
 ('Dodge',[req('ability','dex',min=13)],[], '+1 Reflex against a chosen opponent while you retain your Dexterity bonus.'),
 ('Skill Focus',[req('trained','$choice')],[effect('skillFocus',5)], 'Gain +5 competence to the chosen trained skill.'),
 ('Skill Training',[req('classSkill','$choice'),req('untrained','$choice')],[effect('skillTraining',5)],'Train one additional class skill.'),
 ('Weapon Focus',[req('proficientChoice','$choice')],[effect('weaponFocus',1)],'+1 attack with the chosen weapon group.'),
 ('Armor Proficiency (Light)',[],[],'Remove light armor penalties and enable its equipment bonuses.'),
 ('Armor Proficiency (Medium)',[req('feat',feat('Armor Proficiency (Light)'))],[],'Remove medium armor penalties and enable its equipment bonuses.')
]
for name, requirements, effects, reminder in feat_rows:
    repeat = 'choice' if name in ['Skill Focus','Skill Training','Weapon Focus'] else 'stack' if name in ['Improved Damage Threshold','Linguist'] else 'never'
    f = record('feat',name,prerequisite=dict(kind='all',requirements=requirements),repeat=repeat,effects=effects,reminder=reminder)
    if repeat=='choice': f['choiceType'] = 'weaponGroup' if name=='Weapon Focus' else 'skill'
    pack['feats'].append(f)
for group in ['Pistols','Rifles','Simple Weapons','Lightsabers']:
    pack['feats'].append(record('feat','Weapon Proficiency ('+group+')',prerequisite={'kind':'all','requirements':[]},repeat='never',effects=[],weaponGroup=slug(group),reminder='Proficiency with '+group.lower()+'.'))
for cls in pack['classes']:
    for f in pack['feats']:
        src = pages[aliases.get(f['name'],{}).get('to',f['name'])]['revisions'][0]['slots']['main']['content']
        if '[['+ 'Category:'+cls['name']+' Bonus Feats]]' in src and (not f.get('weaponGroup') or f['weaponGroup'] in ({'Jedi':['lightsabers','simple-weapons'],'Scoundrel':['pistols','simple-weapons']}.get(cls['name'],['pistols','rifles','simple-weapons']))):
            # Weapon Focus is restricted to lightsabers on the Jedi bonus list.
            cls['bonusFeats'].append(f['id'])
    cls['bonusRestrictions'] = {feat('Weapon Focus'):['lightsabers']} if cls['name']=='Jedi' else {}
    cls['bonusSourceId'] = source(cls['name']+' Bonus Feats')

for name,tree,requirements,reminder,repeat in [
 ('Block','Lightsaber Combat',[req('feat',feat('Force Sensitivity'))], 'React with Use the Force against a melee attack; each additional Block/Deflect adds a cumulative -5. An ignited lightsaber is required.','never'),
 ('Deflect','Lightsaber Combat',[req('feat',feat('Force Sensitivity'))], 'React with Use the Force against a ranged attack; each additional Block/Deflect adds a cumulative -5. An ignited lightsaber is required.','never'),
 ('Skilled Advisor','Jedi Consular',[], 'Spend a full-round action to advise an ally: +5 to their next skill check, or +10 with a Force Point.','never'),
 ('Born Leader','Leadership',[], 'Once per encounter, allies in sight gain +1 insight to attacks while they remain in sight.','never'),
 ('Inspire Confidence','Inspiration',[], 'Use a standard action to grant allies in sight +1 morale to attacks and skills for the encounter.','never'),
 ('Wealth','Lineage',[], 'On each level gained after selection, including the selection level, receive 5,000 × Noble class level credits. Record income in your credit balance.','never'),
 ('Knack','Fortune',[], 'Once per day per selection, reroll a skill check and keep the better roll.','stack'),
 ("Fool's Luck",'Fortune',[], 'Spend a standard action and Force Point: +1 competence to attacks or defenses, or +5 competence to skills, for the encounter.','never'),
 ('Sneak Attack','Misfortune',[], 'Add 1d6 per selection against targets denied Dexterity; ranged attacks require a target within 6 squares.','stack'),
 ('Acute Senses','Awareness',[], 'Perception rerolls must use the new result. Also applies to Use Sensors.','never'),
 ('Improved Initiative','Awareness',[req('talent','talent:acute-senses')], 'Initiative rerolls must use the new result.','never'),
 ('Evasion','Survivor',[], 'Area attacks deal half damage on a hit and none on a miss.','never'),
 ('Armored Defense','Armor Specialist',[], 'With proficient armor, use the higher of armor bonus and heroic level for Reflex.','never'),
 ('Improved Armored Defense','Armor Specialist',[req('talent','talent:armored-defense')], 'With proficient armor, use the higher of armor bonus and heroic level + half armor bonus.','never'),
 ('Weapon Specialization','Weapon Specialist',[req('focusChoice','$choice')], '+2 damage with the chosen weapon group.','choice')
]:
    t = record('talent',name,tree='tree:'+slug(tree),prerequisite=dict(kind='all',requirements=requirements),repeat=repeat,reminder=reminder,effects=[effect('weaponSpecialization',2)] if name=='Weapon Specialization' else [])
    if repeat=='choice': t['choiceType']='weaponGroup'
    pack['talents'].append(t)

for name,group,mode,dice,damage,cost,weight in [
 ('Blaster Pistol','pistols','ranged','3d6','Energy',500,1),('Blaster Rifle','rifles','ranged','3d8','Energy',1000,4.5),('Lightsaber','lightsabers','melee','2d8','Energy and slashing',3000,1),('Knife','simple-weapons','melee','1d4','Slashing or piercing',25,1)]:
    pack['equipment'].append(record('equipment',name,kind='weapon',group=group,mode=mode,size={'Knife':'tiny','Blaster Pistol':'small'}.get(name,'medium'),damage=dice,damageType=damage,cost=cost,weight=weight))
for name,cost,weight,bonus,fort,maxdex in [('Blast Helmet and Vest',500,3,2,0,5),('Combat Jumpsuit',1500,8,4,0,4),('Stormtrooper Armor',8000,10,6,2,3)]:
    pack['equipment'].append(record('equipment',name,kind='armor',category='light',cost=cost,weight=weight,armorBonus=bonus,fortitudeBonus=fort,maxDex=maxdex,skillBonuses={skill('Perception'):2} if name=='Stormtrooper Armor' else {}))
for name,title,cost,weight in [('Comlink (Short-Range)','Comlink',25,.1),('Medpac','Medpac',100,1),('Utility Belt (Standard)','Utility Belt',500,4)]:
    pack['equipment'].append(record('equipment',name,title,kind='gear',cost=cost,weight=weight))
for key in ['species','classes','skills','feats','talents','equipment']:
    pack[key].sort(key=lambda r:r['name'])
pack['species'].append(record('species','Gungan',abilityAdjustments={'dex':2,'int':-2,'cha':-2},
    defenses={'reflex':2},size='medium',speed=6,speeds={'swim':4},languages=['Basic','Gunganese'],
    bonusFeats=0,bonusSkills=0,conditionalFocus=None,reminders=[]))
pack['species'].append(record('species','Gamorrean',abilityAdjustments={'str':2,'dex':-2,'int':-2},
    defenses={'fortitude':2},size='medium',speed=6,languages=['Gamorrean','Basic (understood)'],
    bonusFeats=0,bonusSkills=0,conditionalFocus=None,reminders=[],startingFeats=['feat:improved-damage-threshold'],
    excludedStartingFeats=['feat:weapon-proficiency-pistols','feat:weapon-proficiency-rifles']))
pack['species'].sort(key=lambda r:r['name'])
spec = importlib.util.spec_from_file_location('heroic_catalog', ROOT / 'tools/compile-heroic-traits.py')
heroic_catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(heroic_catalog)
heroic_catalog.compile_traits(pack, pages, source, record, skill)
spec = importlib.util.spec_from_file_location('wiki_articles', ROOT / 'tools/compile-wiki-articles.py')
wiki_articles = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wiki_articles)
wiki_articles.compile_articles(pack, ROOT, pages, source, record)
pack['sources']=sorted(sources.values(), key=lambda s:s['id'])
(ROOT / 'data/core.json').write_text(json.dumps(pack,indent=2,ensure_ascii=False)+'\n')
print('Compiled', {k:len(pack[k]) for k in ['species','classes','skills','feats','talents','equipment','sources']})
