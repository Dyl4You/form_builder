// src/utils/teiToJson.js   ← overwrite the file
const { XMLParser } = require('fast-xml-parser');

function teiToJson (tei) {
  const p = new XMLParser({ ignoreAttributes: false });
  const j = p.parse(tei);

  const md  = j.TEI?.teiHeader?.fileDesc?.titleStmt ?? {};
  const div = j.TEI?.text?.body?.div ?? [];

  return {
    title   : md.title  || '',
    authors : (md.author || []).map(a =>
                [a.persName?.forename?._, a.persName?.surname?._]
                .filter(Boolean).join(' ')),
    abstract: (j.TEI?.text?.front?.abstract?.p || '').trim(),
    sections: div.map(s => ({
      heading : s.head || '',
      content : (s.p || []).map(p => (typeof p === 'string' ? p : p._)).join('\n')
    }))
  };
}

module.exports = { teiToJson };
