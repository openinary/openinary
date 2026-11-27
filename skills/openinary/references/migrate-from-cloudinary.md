# Migrate a project from Cloudinary

The full guide, with the URL mapping and the copy script, is the source of
truth. Read it first:

  https://openinary.dev/docs/migrate-from-cloudinary/index.md

What it does not cover is how you, the agent, run it in this project:

1. **Values.** Call `get_account` for `<DELIVERY_BASE>` and `<BUCKET_ID>`.
   Openinary URLs look like `<DELIVERY_BASE>/t/<transformations>/<path>`.

2. **Inventory, no edits.** Find every Cloudinary URL builder, SDK call,
   upload widget and environment variable in the repository. Report them to
   the user with what each becomes, and check the guide's "Before you start"
   list for features Openinary does not have yet. Wait for a go.

3. **Copy the files.** The guide's script copies the whole library and keeps
   paths. It needs the user's Cloudinary secret and `OPENINARY_API_KEY`, so
   the user runs it themselves, in their own terminal; give them the exact
   commands, starting with `--dry-run`. For a handful of files only, you can
   copy them yourself with `create_upload_url`, keeping the same paths. Check
   the result with `list_files`.

4. **Switch uploads.** Replace the Cloudinary upload flow with the one in
   `integrate.md` (signing route plus uploader), not a direct call with the
   API key from the browser.

5. **Rewrite delivery URLs** with the guide's mapping. A bare
   `<DELIVERY_BASE>/t/<path>` serves the original.

6. **Clean up last.** Remove the Cloudinary SDK and its environment variables
   only once nothing references them, and tell the user which variables to
   delete from their hosting provider.

Keep the change as small as the project allows, and verify with a real
upload and a real delivered image before calling it done.
