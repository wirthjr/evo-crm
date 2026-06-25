class CreateAttendantSessions < ActiveRecord::Migration[7.1]
  def change
    create_table :attendant_sessions, id: :uuid do |t|
      t.uuid :user_id, null: false
      t.string :status, null: false, default: 'active'
      t.datetime :started_at, null: false
      t.datetime :ended_at
      t.timestamps
    end

    add_index :attendant_sessions, :user_id
    add_index :attendant_sessions, :status
    add_index :attendant_sessions, [:user_id, :status]
  end
end
