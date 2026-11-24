import {
  AgencyMessageFromJSON,
  AgencyMessageToJSON,
  FunderMessageFromJSON,
  FunderMessageToJSON,
  FundersMessageFromJSON,
  FundersMessageToJSON,
  JournalMessageFromJSON,
  JournalMessageToJSON,
  JournalsMessageFromJSON,
  JournalsMessageToJSON,
  LicensesMessageFromJSON,
  LicensesMessageToJSON,
  MemberMessageFromJSON,
  MemberMessageToJSON,
  MembersMessageFromJSON,
  MembersMessageToJSON,
  PrefixMessageFromJSON,
  PrefixMessageToJSON,
  TypeMessageFromJSON,
  TypeMessageToJSON,
  TypesMessageFromJSON,
  TypesMessageToJSON,
  WorkMessageFromJSON,
  WorkMessageToJSON,
  WorksMessageFromJSON,
  WorksMessageToJSON,
} from '../generated/typescript-fetch';
import funder from './fixtures/funder.json';
import funders from './fixtures/funders.json';
import journal from './fixtures/journal.json';
import journals from './fixtures/journals.json';
import licenses from './fixtures/licenses.json';
import member from './fixtures/member.json';
import members from './fixtures/members.json';
import prefix from './fixtures/prefix.json';
import type from './fixtures/type.json';
import types from './fixtures/types.json';
import work from './fixtures/work.json';
import workAgency from './fixtures/work-agency.json';
import works from './fixtures/works.json';
import worksFacets from './fixtures/works-facets.json';
import worksMixed from './fixtures/works-mixed.json';

type Codec = [(json: any) => unknown, (value: any) => unknown];

const fixtures: [string, unknown, Codec][] = [
  ['work', work, [WorkMessageFromJSON, WorkMessageToJSON]],
  ['works', works, [WorksMessageFromJSON, WorksMessageToJSON]],
  ['works-mixed', worksMixed, [WorksMessageFromJSON, WorksMessageToJSON]],
  ['works-facets', worksFacets, [WorksMessageFromJSON, WorksMessageToJSON]],
  ['work-agency', workAgency, [AgencyMessageFromJSON, AgencyMessageToJSON]],
  ['funder', funder, [FunderMessageFromJSON, FunderMessageToJSON]],
  ['funders', funders, [FundersMessageFromJSON, FundersMessageToJSON]],
  ['journal', journal, [JournalMessageFromJSON, JournalMessageToJSON]],
  ['journals', journals, [JournalsMessageFromJSON, JournalsMessageToJSON]],
  ['licenses', licenses, [LicensesMessageFromJSON, LicensesMessageToJSON]],
  ['member', member, [MemberMessageFromJSON, MemberMessageToJSON]],
  ['members', members, [MembersMessageFromJSON, MembersMessageToJSON]],
  ['prefix', prefix, [PrefixMessageFromJSON, PrefixMessageToJSON]],
  ['type', type, [TypeMessageFromJSON, TypeMessageToJSON]],
  ['types', types, [TypesMessageFromJSON, TypesMessageToJSON]],
];

function droppedPaths(raw: unknown, roundTripped: unknown, path = '', dropped = new Set<string>()): Set<string> {
  if (Array.isArray(raw)) {
    raw.forEach((item, index) => droppedPaths(item, Array.isArray(roundTripped) ? roundTripped[index] : undefined, `${path}[]`, dropped));
  } else if (raw !== null && typeof raw === 'object') {
    if (roundTripped === null || typeof roundTripped !== 'object') {
      dropped.add(path);
      return dropped;
    }
    for (const [key, value] of Object.entries(raw)) {
      if (!(key in roundTripped)) {
        dropped.add(`${path}.${key}`);
      } else {
        droppedPaths(value, (roundTripped as Record<string, unknown>)[key], `${path}.${key}`, dropped);
      }
    }
  } else if (raw !== null && roundTripped !== null && typeof raw !== typeof roundTripped) {
    dropped.add(`${path} (${typeof raw} became ${typeof roundTripped})`);
  }
  return dropped;
}

// The generated FromJSON functions drop any field the spec does not name, so these tests fail
// when the spec drifts from the JSON that api.crossref.org returns.
describe('Crossref recorded responses', () => {
  test.each(fixtures)('%s keeps every field', (_name, raw, [fromJSON, toJSON]) => {
    const roundTripped = JSON.parse(JSON.stringify(toJSON(fromJSON(raw))));

    expect([...droppedPaths(raw, roundTripped)]).toEqual([]);
  });

  test('work dates, funders and references keep their types', () => {
    const { message } = WorkMessageFromJSON(work);

    expect(message.indexed.date_time).toBeInstanceOf(Date);
    expect(message.issued.date_parts[0][0]).toBe(2020);
    expect(message.reference?.length).toBeGreaterThan(0);
    expect(message.author?.[0].family).toBeDefined();
  });

  test('journal ISSNs and coverage keep their shape', () => {
    const { message } = JournalMessageFromJSON(journal);

    expect(message.issn_type?.map((issn) => issn.type)).toEqual(expect.arrayContaining(['print', 'electronic']));
    expect(typeof message.coverage_type?.all?.references).toBe('number');
  });
});
