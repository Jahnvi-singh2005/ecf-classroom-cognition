import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexesPath = path.resolve(__dirname, '../firestore.indexes.json');

const REQUIRED_INDEXES = [
    {
        collectionGroup: 'experimentSessionDrafts',
        fields: [
            { fieldPath: 'participantKey', order: 'ASCENDING' },
            { fieldPath: 'status', order: 'ASCENDING' },
        ],
    },
    {
        collectionGroup: 'experimentSessionDrafts',
        fields: [
            { fieldPath: 'status', order: 'ASCENDING' },
            { fieldPath: 'lastUpdatedAt', order: 'ASCENDING' },
        ],
    },
];

const describeIndex = (index) => {
    const sequence = index.fields
        .map((field) => `${field.fieldPath}:${field.order || 'ASCENDING'}`)
        .join(' -> ');
    return `${index.collectionGroup} [${sequence}]`;
};

const isSameField = (left, right) => (
    left.fieldPath === right.fieldPath
    && (left.order || 'ASCENDING') === (right.order || 'ASCENDING')
);

const hasRequiredShape = (candidate, required) => {
    if (!candidate || candidate.collectionGroup !== required.collectionGroup) {
        return false;
    }

    if (!Array.isArray(candidate.fields) || candidate.fields.length !== required.fields.length) {
        return false;
    }

    return required.fields.every((requiredField, index) => isSameField(candidate.fields[index], requiredField));
};

const main = async () => {
    let raw;
    try {
        raw = await readFile(indexesPath, 'utf8');
    } catch (error) {
        console.error(`ERROR: Could not read ${indexesPath}: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        console.error(`ERROR: ${indexesPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }

    if (!parsed || !Array.isArray(parsed.indexes)) {
        console.error('ERROR: firestore.indexes.json must contain an "indexes" array.');
        process.exit(1);
    }

    if (!Array.isArray(parsed.fieldOverrides)) {
        console.error('ERROR: firestore.indexes.json must contain a "fieldOverrides" array.');
        process.exit(1);
    }

    const missing = REQUIRED_INDEXES.filter(
        (required) => !parsed.indexes.some((candidate) => hasRequiredShape(candidate, required)),
    );

    if (missing.length > 0) {
        console.error('ERROR: Missing required Firestore composite indexes:');
        missing.forEach((index) => {
            console.error(`- ${describeIndex(index)}`);
        });
        process.exit(1);
    }

    console.log('Firestore index verification passed. Required indexes are present.');
    process.exit(0);
};

void main();
