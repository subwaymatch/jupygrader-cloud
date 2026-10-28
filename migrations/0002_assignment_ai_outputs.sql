-- An assignment's own choice of how many notebook output images and interactive outputs go to
-- the AI: JSON {"mode": "all" | "limit" | "none", "limit": n}. Null uses the site's setting.
alter table assignment add column ai_images text;
alter table assignment add column ai_interactive text;
