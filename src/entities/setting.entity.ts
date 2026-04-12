import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("settings")
@Index(["group"])
export class SettingEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "key", type: "varchar", length: 255, unique: true })
  key!: string;

  @Column({ name: "value", type: "text" })
  value!: string;

  @Column({ name: "type", type: "varchar", length: 20, default: "string" })
  type!: string;

  @Column({ name: "group", type: "varchar", length: 255, nullable: true })
  group!: string | null;

  @Column({ name: "description", type: "varchar", length: 512, nullable: true })
  description!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
