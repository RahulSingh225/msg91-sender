const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

function flatten(obj, prefix = '', res = {}) {
	if (obj === null || obj === undefined) return res;
	if (typeof obj !== 'object' || Array.isArray(obj)) {
		res[prefix] = Array.isArray(obj) ? JSON.stringify(obj) : obj;
		return res;
	}
	for (const [k, v] of Object.entries(obj)) {
		const key = prefix ? `${prefix}.${k}` : k;
		if (v && typeof v === 'object' && !Array.isArray(v)) {
			flatten(v, key, res);
		} else {
			res[key] = Array.isArray(v) ? JSON.stringify(v) : v;
		}
	}
	return res;
}

function quoteCsv(val) {
	if (val === null || val === undefined) return '';
	const s = String(val);
	if (s.includes('"')) return '"' + s.replace(/"/g, '""') + '"';
	if (s.includes(',') || s.includes('\n') || s.includes('\r')) return '"' + s + '"';
	return s;
}

function usage() {
	console.error('Usage: node convert.js <input.csv> <output.csv>');
	console.error('Reads a CSV with a single `payload` column containing JSON per row.');
}

async function run() {
	const argv = process.argv.slice(2);
	if (argv.length < 2) {
		usage();
		process.exit(1);
	}
	const input = argv[0];
	const output = argv[1];

	if (!fs.existsSync(input)) {
		console.error('Input file not found:', input);
		process.exit(2);
	}

	const rows = [];
	const keySet = new Set();

	await new Promise((resolve, reject) => {
		fs.createReadStream(input)
			.pipe(csv())
			.on('data', (data) => {
				const payloadRaw = data.payload || '';
				let parsed = {};
				try {
					parsed = payloadRaw ? JSON.parse(payloadRaw) : {};
				} catch (e) {
					// keep parsed empty and also store raw under a key so user can inspect
					parsed = { __payload_raw: payloadRaw };
				}
				const flat = flatten(parsed);
				rows.push(flat);
				Object.keys(flat).forEach(k => keySet.add(k));
			})
			.on('end', () => resolve())
			.on('error', (err) => reject(err));
	});

	const headers = Array.from(keySet);

	const outStream = fs.createWriteStream(output, { encoding: 'utf8' });
	outStream.write(headers.map(quoteCsv).join(',') + '\n');
	for (const r of rows) {
		const line = headers.map(h => quoteCsv(r[h])).join(',');
		outStream.write(line + '\n');
	}
	outStream.end();
	console.log('Wrote', rows.length, 'rows to', output);
}

run().catch(err => {
	console.error('Error:', err && err.message ? err.message : err);
	process.exit(3);
});

