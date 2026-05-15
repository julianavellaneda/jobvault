import { createDb } from '../src/storage/sqlite/client'
import { SqliteDataAdapter } from '../src/storage/sqlite/adapter'

const { db, client } = await createDb('file:./tmp.db')
const adapter = new SqliteDataAdapter(db)

const app = await adapter.createApplication({
  url: 'https://example.com/job', company: 'Acme', role: 'SWE',
  salary: '', location: '', workArrangement: '', source: '',
  tags: [], status: 'pending', notes: '',
  deadline: null, followUpDate: null, appliedAt: null,
  addedBy: 'local', addedByName: 'Local',
})
console.log('created:', app)
console.log('list:', await adapter.listApplications())
client.close()
