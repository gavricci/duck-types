create table orders (
  id         integer primary key,
  customer   varchar not null,
  total      decimal(10, 2) not null,
  placed_at  timestamp not null,
  tags       varchar[]
);

create type mood as enum ('sad', 'ok', 'happy');
