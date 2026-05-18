import axios from 'axios'

const client = axios.create({
  baseURL: 'http://localhost:4000/api',
  timeout: 8000,
})

export function getPublishedAgents() {
  return client.get('/agents/published')
}

export function getAgentPage(params) {
  return client.get('/agents', { params })
}

export function getAgentDetail(id) {
  return client.get(`/agents/${id}`)
}

export function simulateAgentChat(payload) {
  return client.post('/chat/simulate', payload)
}

export default client
