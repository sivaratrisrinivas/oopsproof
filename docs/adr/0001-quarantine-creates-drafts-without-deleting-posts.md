# Quarantine Creates Drafts Without Deleting Posts

OopsProof v1 quarantines risky scheduled posts by creating safe draft replacements, but it does not delete the original scheduled posts from Buffer. This keeps the first version honest and safe while the exact Buffer delete mutation and post-type behavior remain unverified; the app must tell users to remove the original scheduled post in Buffer after the draft is created.
