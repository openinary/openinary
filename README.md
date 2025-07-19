# ☁️ Openinary

**Cloudinary, but open source. Powered by Cloudflare.**

Openinary is an open source, Cloudflare-native media CDN that lets you upload, transform, and deliver images and videos from the edge.

Built for developers, no-code builders, and indie creators who want fast, modern, self-hostable media infrastructure.

---

## 🚀 Why Openinary?

Most media CDNs are closed, expensive, and built for enterprise.

We’re building Openinary to be:

- **💡 Open** — MIT-licensed, transparent, easy to contribute to
- **⚡ Fast** — edge-first with Cloudflare Workers, R2 and KV
- **🧩 Modular** — easily pluggable in any stack or tool
- **🎯 Focused** — just the essentials: upload, transform, deliver

---

## 🔧 Planned Stack

| Layer       | Tool                         |
| ----------- | ---------------------------- |
| CDN & Logic | **Cloudflare Workers**       |
| Storage     | **Cloudflare R2**            |
| Cache/store | **KV**, **D1** (optional)    |
| UI          | React + Tailwind (via Pages) |
| Upload UX   | REST API + drag & drop UI    |
| Infra       | Wrangler CLI                 |

---

## 📦 Key Features (MVP Scope)

- [ ] Upload media via API
- [ ] Serve media from R2
- [ ] Transform images on-the-fly via URL
- [ ] UI for uploads + previews
- [ ] Metadata storage in D1
- [ ] Edge caching via KV
- [ ] Optional presigned uploads
- [ ] Easy deployment with Wrangler CLI

---

## 💡 Example Use Cases

- You’re building a personal site and need fast image delivery.
- You’re a no-code tool developer looking to offer media uploads.
- You’re self-hosting a blog, app or internal tool with image needs.
- You want to escape Cloudinary's limits and take control.

---

## 🤝 Contributing

We’re just getting started — and we’d love your help!

Whether you're into backend, UI, devtools, or docs, you’re welcome.
Start by checking the [issues](https://github.com/openinary/openinary/issues) or say hi in Discussions.

---

## 📄 License

MIT. Use it freely. Fork it. Improve it. Let’s build it together.
